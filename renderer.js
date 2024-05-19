import { defs, tiny } from './examples/common.js';

const {
    Vector, Vector3, vec, vec3, vec4, color, hex_color, Matrix, Mat4, Light, Shape, Material, Scene, Shader
} = tiny;

const RenderBuffers = Object.freeze({
  kGBufferDiffuseMetallic: 0,
  kGBufferNormalRoughness: 1,
  kGBufferVelocity:        2,
  kGBufferDepth:           3,
  kShadowMapLamp:          4,
  kShadowMapSun:           5,
  kPBRLighting:            6,
  kTAA:                    7,
  kPostProcessing:         8,
  kCount:                  9,
});


export class FullscreenShader extends Shader
{
  constructor()
  {
    super();
  }

  vertex_glsl_code()
  {
    return `
        precision mediump float;

        attribute vec3 position;
        attribute vec2 texture_coord;

        varying vec2 f_UV;
        
        void main()
        {                                                                   
          gl_Position = vec4( position.xy, 0.0, 1.0 );
          f_UV        = texture_coord;
        } `;
  }

  fragment_glsl_code()
  {
    return `
      precision mediump float;

      uniform sampler2D g_Sampler;

      varying vec2 f_UV;

      void main()
      {                                                           
        gl_FragColor = vec4( texture2D( g_Sampler, f_UV ).rgb, 1.0 );
      } `;
  }

  update_GPU( gl, gpu_addresses, gpu_state, _,  material )
  {
    gl.activeTexture( gl.TEXTURE0 );
    gl.bindTexture( gl.TEXTURE_2D, material.texture );
    gl.uniform1i( gpu_addresses.g_Sampler, 0 );
  }
}

export class StandardBrdf extends Shader
{
  constructor()
  {
    super();
  }

  vertex_glsl_code()
  {
    return `
        precision mediump float;

        attribute vec3 position;
        attribute vec2 texture_coord;

        varying vec2 f_UV;
        
        void main()
        {                                                                   
          gl_Position = vec4( position.xy, 0.0, 1.0 );
          f_UV        = texture_coord;
        } `;
  }

  fragment_glsl_code()
  {
    return `
      precision mediump float;

      uniform sampler2D g_DiffuseMetallic;
      uniform sampler2D g_NormalRoughness;
      uniform sampler2D g_Depth;

      uniform mat4      g_InverseViewProj;
      uniform vec3      g_DirectionalLightDirection;
      uniform vec3      g_DirectionalLightChromaticity;
      uniform float     g_DirectionalLightLuminance;

      uniform vec3      g_WSCameraPosition;

      varying vec2      f_UV;
      
      const float kPI  = 3.1415926535897932;

      // NOTE(bshihabi): A lot of this lighting shader is taken from my own personal renderer
      // Mostly translated from HLSL to GLSL
      float distribution_ggx( vec3 normal, vec3 halfway_vector, float roughness )
      {
        float a      = roughness * roughness;
        float a2     = a * a;
        float NdotH  = max( dot( normal, halfway_vector ), 0.0 );
        float NdotH2 = NdotH * NdotH;

        float nom    = a2;
        float denom  = ( NdotH2 * ( a2 - 1.0 ) + 1.0 );
        denom        = kPI * denom * denom;

        return nom / max( denom, 0.0000001 );
      }

      float geometry_schlick_ggx( float NdotV, float roughness )
      {
        float r    = ( roughness + 1.0 );
        float k    = ( r * r ) / 8.0;

        float nom   = NdotV;
        float denom = NdotV * ( 1.0 - k ) + k;

        return nom / denom;
      }

      float geometry_smith( vec3 normal, vec3 view_direction, vec3 light_direction, float roughness )
      {
        float NdotV = max( dot( normal, view_direction ), 0.0 );
        float NdotL = max( dot(normal, light_direction), 0.0 );
        float ggx2  = geometry_schlick_ggx( NdotV, roughness );
        float ggx1  = geometry_schlick_ggx( NdotL, roughness );

        return ggx1 * ggx2;
      }

      vec3 fresnel_schlick( float cos_theta, vec3 f0 )
      {
        return f0 + ( vec3( 1.0, 1.0, 1.0 ) - f0 ) * pow( max( 1.0 - cos_theta, 0.0 ), 5.0 );
      }

      // Rendering Equation: ∫ fᵣ(x,ωᵢ,ωₒ,λ,t) Lᵢ(x,ωᵢ,ωₒ,λ,t) (ωᵢ⋅n̂) dωᵢ

      vec3 evaluate_lambertian(vec3 diffuse)
      {
        return diffuse / kPI;
      }

      vec3 evaluate_directional_radiance( vec3 light_diffuse, float light_intensity )
      {
        return light_diffuse * light_intensity;
      }

      float evaluate_cos_theta( vec3 light_direction, vec3 normal )
      {
        light_direction = -normalize( light_direction );
        return max( dot( light_direction, normal ), 0.0 );
      }

      vec3 evaluate_directional_light(
        vec3  light_direction,
        vec3  light_diffuse,
        float light_intensity,
        vec3  view_direction,
        vec3  normal,
        float roughness,
        float metallic,
        vec3  diffuse
      ) {
        light_direction = -normalize( light_direction );

        // The light direction from the fragment position
        vec3 halfway_vector  = normalize( view_direction + light_direction );

        // Add the radiance
        vec3 radiance        = light_diffuse * light_intensity;

        // Surface reflection at 0 incidence
        vec3   f0        = vec3( 0.04, 0.04, 0.04 );
        f0               = mix( f0, diffuse, metallic );

        // Cook torrance BRDF
        float  D         = distribution_ggx( normal, halfway_vector, roughness );
        float  G         = geometry_smith( normal, view_direction, light_direction, roughness );
        vec3   F         = fresnel_schlick( clamp( dot( halfway_vector, view_direction ), 0.0, 1.0 ), f0 );

        vec3   kS         = F;
        vec3   kD         = vec3( 1.0, 1.0, 1.0 ) - kS;
        kD               *= 1.0 - metallic;

        vec3  numerator   = D * G * F;
        float denominator = 4.0 * max( dot( normal, view_direction ), 0.0 ) * max( dot( normal, light_direction ), 0.0 );
        vec3  specular    = numerator / max( denominator, 0.001 );

        // Get the cosine theta of the light against the normal
        float cos_theta      = max( dot( normal, light_direction ), 0.0 );

        return ( ( 1.0 / kPI ) * kD * diffuse + specular ) * radiance * cos_theta;
      }

      
      vec4 screen_to_world( vec2 uv, float depth )
      {
        uv.y                   = 1.0 - uv.y;
        vec2 normalized_screen = uv.xy * 2.0 - vec2( 1.0, 1.0 );
        normalized_screen.y   *= -1.0;

        vec4 clip              = vec4( normalized_screen, 2.0 * depth - 1.0, 1.0 );

        vec4 world             = g_InverseViewProj * clip;
        world                 /= world.w;

        return world;
      }

      vec3 decode_normal( vec4 encoded )
      {
        encoded *= 255.0;
        vec3 ret;
        ret.x = encoded.r / 255.0 + ( encoded.g / 255.0 ) / 255.0;
        ret.y = encoded.b / 255.0 + ( encoded.a / 255.0 ) / 255.0;
        ret = ret * 2.0 - 1.0;
        ret.z = sqrt( 1.0 - ( ret.x * ret.x + ret.y * ret.y ) );
        return ret;
      }

      void main()
      {                                                           
        vec3  diffuse   = texture2D( g_DiffuseMetallic, f_UV ).rgb;
        float metallic  = texture2D( g_DiffuseMetallic, f_UV ).a;
        
        vec3  normal    = decode_normal( texture2D( g_NormalRoughness, f_UV ).rgba );
        // float roughness = texture2D( g_NormalRoughness, f_UV ).a;

        float depth     = texture2D( g_Depth,           f_UV ).r;

        vec3 ws_pos      = screen_to_world( f_UV, depth ).xyz;
        vec3 view_dir    = g_WSCameraPosition.xyz - ws_pos;

        vec3 lambertian  = evaluate_lambertian( diffuse );

        vec3 directional = evaluate_directional_light(
          vec3( 0.0, -1.0, 0.0 ),
          vec3( 1.0, 1.0, 1.0 ),
          20.0,
          view_dir,
          normal,
          0.2,
          0.0,
          vec3( 1.0, 1.0, 1.0 )
        );

        vec3 irradiance = directional;

        gl_FragColor    = vec4( normal, 1.0 ); // depth == 1.0 ? vec4( 0.0 ) : vec4( lambertian * irradiance, 1.0 );
      } `;
  }

  update_GPU( gl, gpu_addresses, gpu_state, _,  material )
  {
    gl.activeTexture( gl.TEXTURE0 );
    gl.bindTexture( gl.TEXTURE_2D, material.diffuse_metallic );
    gl.uniform1i( gpu_addresses.g_DiffuseMetallic, 0 );

    gl.activeTexture( gl.TEXTURE1 );
    gl.bindTexture( gl.TEXTURE_2D, material.normal_roughness );
    gl.uniform1i( gpu_addresses.g_NormalRoughness, 1 );

    gl.activeTexture( gl.TEXTURE2 );
    gl.bindTexture( gl.TEXTURE_2D, material.depth );
    gl.uniform1i( gpu_addresses.g_Depth,           2 );

    const view_proj         = gpu_state.projection_transform.times( gpu_state.camera_inverse );
    const inverse_view_proj = Mat4.inverse( view_proj );
    gl.uniformMatrix4fv( gpu_addresses.g_InverseViewProj, false, Matrix.flatten_2D_to_1D( inverse_view_proj.transposed() ) );

    if ( gpu_state.lights.length <= 0 )
      return;

    const directional_light_direction    = vec3( 0.0, -1.0, 0.0 );
    const directional_light_chromaticity = vec3( 1.0, 1.0, 1.0 );
    const directional_light_luminance    = 10.0;
    gl.uniform3fv( gpu_addresses.g_DirectionalLightDirection,    directional_light_direction );
    gl.uniform3fv( gpu_addresses.g_DirectionalLightChromaticity, directional_light_chromaticity );
    gl.uniform1f ( gpu_addresses.g_DirectionalLightLuminance,    directional_light_luminance );
    const O = vec4(0, 0, 0, 1);
    const camera_center = gpu_state.camera_transform.times(O).to3();
    gl.uniform3fv( gpu_addresses.g_WSCameraPosition, camera_center );
  }
}

export class PostProcessing extends Shader
{
  constructor()
  {
    super();
  }

  vertex_glsl_code()
  {
    return `
        precision mediump float;

        attribute vec3 position;
        attribute vec2 texture_coord;

        varying vec2 f_UV;
        
        void main()
        {                                                                   
          gl_Position = vec4( position.xy, 0.0, 1.0 );
          f_UV        = texture_coord;
        } `;
  }

  fragment_glsl_code()
  {
    return `
      precision mediump float;

      uniform sampler2D g_PBRBuffer;

      varying vec2 f_UV;

      void main()
      {                                                           
        vec4  radiometry = texture2D( g_PBRBuffer, f_UV ).rgba;

        gl_FragColor = radiometry;
      } `;
  }

  update_GPU( gl, gpu_addresses, gpu_state, _,  material )
  {
    gl.activeTexture( gl.TEXTURE0 );
    gl.bindTexture( gl.TEXTURE_2D, material.pbr_buffer );
    gl.uniform1i( gpu_addresses.g_PBRBuffer, 0 );
  }
}

export class Renderer 
{
  constructor( gl )
  {
    this.gl = gl;
    /*
    const draw_buffers_ext = gl.getExtension( "WEBGL_draw_buffers" );
    if ( !draw_buffers_ext )
    {
      alert( "Need WEBGL_draw_buffers extension!" );
    }
    */

    const depth_texture_ext = gl.getExtension( "WEBGL_depth_texture" );
    if ( !depth_texture_ext )
    {
      alert( "Need WEBGL_depth_texture extension!" );
    }

    this.render_buffers = new Array( RenderBuffers.kCount );
    // this.init_gbuffer( draw_buffers_ext );
    this.init_shadow_maps();
    this.init_pbr_buffer();
    this.init_post_processing_buffer();

    this.quad = new defs.Square();

    this.standard_brdf   = new Material( new StandardBrdf(), {
      diffuse_metallic: this.render_buffers[ RenderBuffers.kGBufferDiffuseMetallic ],
      normal_roughness: this.render_buffers[ RenderBuffers.kGBufferNormalRoughness ],
      depth:            this.render_buffers[ RenderBuffers.kGBufferDepth           ],
    } );
    this.post_processing = new Material( new PostProcessing(),   { pbr_buffer: this.render_buffers[ RenderBuffers.kPBRLighting    ] } );
    this.blit            = new Material( new FullscreenShader(), { texture:    this.render_buffers[ RenderBuffers.kPostProcessing ] } );
  }

/*
  init_gbuffer( draw_buffers_ext )
  {
    const gl = this.gl;

    this.gbuffer = gl.createFramebuffer();
    
    this.render_buffers[ RenderBuffers.kGBufferDiffuseMetallic ] = gl.createTexture();
    this.render_buffers[ RenderBuffers.kGBufferNormalRoughness ] = gl.createTexture();
    this.render_buffers[ RenderBuffers.kGBufferVelocity        ] = gl.createTexture();
    this.render_buffers[ RenderBuffers.kGBufferDepth           ] = gl.createTexture();

    gl.bindTexture( gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kGBufferDiffuseMetallic ] );
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE );

    gl.bindTexture( gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kGBufferNormalRoughness ] );
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE );

    gl.bindTexture( gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kGBufferVelocity ] );
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA,  gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE );

    gl.bindTexture( gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kGBufferDepth ] );
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, gl.canvas.width, gl.canvas.height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE );

    gl.bindFramebuffer( gl.FRAMEBUFFER, this.gbuffer );
    gl.framebufferTexture2D( gl.FRAMEBUFFER, draw_buffers_ext.COLOR_ATTACHMENT0_WEBGL, gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kGBufferDiffuseMetallic ], 0 );
    gl.framebufferTexture2D( gl.FRAMEBUFFER, draw_buffers_ext.COLOR_ATTACHMENT1_WEBGL, gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kGBufferNormalRoughness ], 0 );
    gl.framebufferTexture2D( gl.FRAMEBUFFER, draw_buffers_ext.COLOR_ATTACHMENT2_WEBGL, gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kGBufferVelocity        ], 0 );
    gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,                      gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kGBufferDepth           ], 0 );

    const framebuffer_status = gl.checkFramebufferStatus( gl.FRAMEBUFFER );
    if ( framebuffer_status !== gl.FRAMEBUFFER_COMPLETE )
    {
      console.log( framebuffer_status == gl.FRAMEBUFFER_UNSUPPORTED );
      alert( "Failed to create GBuffer!" );
    }

    draw_buffers_ext.drawBuffersWEBGL( [
      draw_buffers_ext.COLOR_ATTACHMENT0_WEBGL,
      draw_buffers_ext.COLOR_ATTACHMENT1_WEBGL,
      draw_buffers_ext.COLOR_ATTACHMENT2_WEBGL,
      draw_buffers_ext.COLOR_ATTACHMENT3_WEBGL,
    ] );

    gl.bindTexture( gl.TEXTURE_2D, null );
    gl.bindFramebuffer( gl.FRAMEBUFFER, null );
  }
  */

  init_pbr_buffer( half_float_ext )
  {
    const gl = this.gl;

    this.pbr_buffer = gl.createFramebuffer();
    
    this.render_buffers[ RenderBuffers.kPBRLighting  ] = gl.createTexture();
    this.render_buffers[ RenderBuffers.kGBufferDepth ] = gl.createTexture();

    gl.bindTexture( gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kPBRLighting ] );
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE );

    gl.bindTexture( gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kGBufferDepth ] );
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, gl.canvas.width, gl.canvas.height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE );

    gl.bindFramebuffer( gl.FRAMEBUFFER, this.pbr_buffer );
    gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kPBRLighting  ], 0 );
    gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,  gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kGBufferDepth ], 0 );

    const framebuffer_status = gl.checkFramebufferStatus( gl.FRAMEBUFFER );
    if ( framebuffer_status !== gl.FRAMEBUFFER_COMPLETE )
    {
      console.log( framebuffer_status == gl.FRAMEBUFFER_UNSUPPORTED ); 
      alert( "Failed to create PBR Buffer!" );
    }

    gl.bindTexture( gl.TEXTURE_2D, null );
    gl.bindFramebuffer( gl.FRAMEBUFFER, null );
  }

  init_post_processing_buffer()
  {
    const gl = this.gl;

    this.post_processing_buffer = gl.createFramebuffer();
    
    this.render_buffers[ RenderBuffers.kPostProcessing ] = gl.createTexture(); 

    gl.bindTexture( gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kPostProcessing ] );
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE );

    gl.bindFramebuffer( gl.FRAMEBUFFER, this.pbr_buffer );
    gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kPostProcessing ], 0 );

    const framebuffer_status = gl.checkFramebufferStatus( gl.FRAMEBUFFER );
    if ( framebuffer_status !== gl.FRAMEBUFFER_COMPLETE )
    {
      console.log( framebuffer_status == gl.FRAMEBUFFER_UNSUPPORTED ); 
      alert( "Failed to create PostProcessing Buffer!" );
    }

    gl.bindTexture( gl.TEXTURE_2D, null );
    gl.bindFramebuffer( gl.FRAMEBUFFER, null );
  }

  init_shadow_maps()
  {
    const gl = this.gl;
    this.directional_shadow_map = gl.createFramebuffer();

    this.render_buffers[ RenderBuffers.kShadowMapSun ] = gl.createTexture();

    gl.bindTexture( gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kShadowMapSun ] );
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, 2048, 2048, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE );

    gl.bindFramebuffer( gl.FRAMEBUFFER, this.directional_shadow_map );
    gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,  gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kShadowMapSun ], 0 );

    const framebuffer_status = gl.checkFramebufferStatus( gl.FRAMEBUFFER );
    if ( framebuffer_status !== gl.FRAMEBUFFER_COMPLETE )
    {
      console.log( framebuffer_status == gl.FRAMEBUFFER_UNSUPPORTED ); 
      alert( "Failed to create ShadowMapSun Buffer!" );
    }

    gl.bindTexture( gl.TEXTURE_2D, null );
    gl.bindFramebuffer( gl.FRAMEBUFFER, null );
    
  }

  render_handler_gbuffer( context, program_state, actors )
  {
    const gl = this.gl;

    gl.bindFramebuffer( gl.FRAMEBUFFER, this.gbuffer );
    gl.viewport( 0, 0, gl.canvas.width, gl.canvas.height );
    gl.clearColor( 0.0, 0.0, 0.0, 0.0 );
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
    gl.depthFunc( gl.LESS );

    for ( let iactor = 0; iactor < actors.length; iactor++ )
    {
      const actor = actors[ iactor ];
      if ( !actor.mesh || !actor.material )
        continue;
      actor.mesh.draw( context, program_state, actor.transform, actor.material );
    }
  }


  render_handler_directional_shadow( context, program_state, actors )
  {
    const gl = this.gl;

    gl.bindFramebuffer( gl.FRAMEBUFFER, this.directional_shadow_map );
    gl.viewport( 0, 0, 2048, 2048 );
    gl.clear( gl.DEPTH_BUFFER_BIT );
    gl.depthFunc( gl.LESS );

    for ( let iactor = 0; iactor < actors.length; iactor++ )
    {
      const actor = actors[ iactor ];
      if ( !actor.mesh || !actor.material )
        continue;
      actor.mesh.draw( context, program_state, actor.transform, actor.material );
    }
  }

  render_handler_lighting( context, program_state, actors )
  {
    const gl = this.gl;

    gl.bindFramebuffer( gl.FRAMEBUFFER, this.pbr_buffer );
    gl.viewport( 0, 0, gl.canvas.width, gl.canvas.height );
    gl.clearColor( 0.0, 0.0, 0.0, 0.0 );
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
    gl.depthFunc( gl.LESS );

    for ( let iactor = 0; iactor < actors.length; iactor++ )
    {
      const actor = actors[ iactor ];
      if ( !actor.mesh || !actor.material )
        continue;
      actor.mesh.draw( context, program_state, actor.transform, actor.material );
    }

    /*
    gl.depthFunc( gl.ALWAYS );
    this.quad.draw( context, program_state, Mat4.identity(), this.standard_brdf );
    */
  }

  render_handler_post_processing( context, program_state )
  {
    const gl = this.gl;

    gl.bindFramebuffer( gl.FRAMEBUFFER, null );
    gl.viewport( 0, 0, gl.canvas.width, gl.canvas.height );
    gl.clearColor( 0.0, 0.0, 0.0, 0.0 );
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
    gl.depthFunc( gl.ALWAYS );

    this.quad.draw( context, program_state, Mat4.identity(), this.blit );
  }

  render_handler_blit( context, program_state )
  {
    const gl = this.gl;

    gl.bindFramebuffer( gl.FRAMEBUFFER, null );
    gl.viewport( 0, 0, gl.canvas.width, gl.canvas.height );
    gl.clearColor( 0.0, 0.0, 0.0, 0.0 );
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
    gl.depthFunc( gl.ALWAYS );

    this.quad.draw( context, program_state, Mat4.identity(), this.blit );
  }

  submit( context, program_state, actors )
  {
    const gl = this.gl;
    // this.render_handler_gbuffer(         context, program_state, actors );
    this.render_handler_lighting(        context, program_state, actors );
    this.render_handler_post_processing( context, program_state, actors );
    this.render_handler_blit(            context, program_state, actors );
  }
};
