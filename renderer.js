import { defs, tiny } from './examples/common.js';

const {
    Vector, Vector3, vec, vec3, vec4, color, hex_color, Matrix, Mat4, Light, Shape, Material, Scene, Shader
} = tiny;

export const RenderBuffers = Object.freeze({
  kGBufferDiffuseMetallic: 0,
  kGBufferNormalRoughness: 1,
  kGBufferVelocity:        2,
  kGBufferDepth:           3,
  // kShadowMapLamp:          4,
  kShadowMapSun:           4,
  kPBRLighting:            5,
  kAccumulation:           6,
  kGBufferVelocityPrev:    7,
  kTAA:                    8,
  kPostProcessing:         9,
  kCount:                  10,
});

const kShadowMapSize = 4096;

export class DirectionalLight
{
  constructor( direction, chromaticity, luminance )
  {
    this.direction    = direction;
    this.chromaticity = chromaticity;
    this.luminance    = luminance;
  }
}

export class SpotLight
{
  constructor( position, direction, chromaticity, luminance, inner_cutoff, outer_cutoff )
  {
    this.position     = position;
    this.direction    = direction;
    this.chromaticity = chromaticity;
    this.luminance    = luminance;
    this.inner_cutoff = inner_cutoff;
    this.outer_cutoff = outer_cutoff;
  }
}

export class Mesh extends Shape
{
  constructor( filename )
  {
      super("position", "normal", "texture_coord");
      // Begin downloading the mesh. Once that completes, return
      // control to our parse_into_mesh function.
      this.load_file(filename);
  }

  load_file( filename )
  {                             // Request the external file and wait for it to load.
      // Failure mode:  Loads an empty shape.
      return fetch(filename)
          .then(response => {
              if (response.ok) return Promise.resolve(response.text())
              else return Promise.reject(response.status)
          })
          .then(obj_file_contents => this.parse_into_mesh(obj_file_contents))
          .catch(error => {
              this.copy_onto_graphics_card(this.gl);
          })
  }

  parse_into_mesh( data )
  {
    var verts = [], vertNormals = [], textures = [], unpacked = {};

    unpacked.verts = [];
    unpacked.norms = [];
    unpacked.textures = [];
    unpacked.hashindices = {};
    unpacked.indices = [];
    unpacked.index = 0;

    var lines = data.split( '\n' );

    var VERTEX_RE = /^v\s/;
    var NORMAL_RE = /^vn\s/;
    var TEXTURE_RE = /^vt\s/;
    var FACE_RE = /^f\s/;
    var WHITESPACE_RE = /\s+/;

    for ( var i = 0; i < lines.length; i++ )
    {
      var line = lines[i].trim();
      var elements = line.split( WHITESPACE_RE );
      elements.shift();

           if (  VERTEX_RE.test(line) ) { verts.push.apply( verts, elements );             }
      else if (  NORMAL_RE.test(line) ) { vertNormals.push.apply( vertNormals, elements ); }
      else if ( TEXTURE_RE.test(line) ) { textures.push.apply( textures, elements );       }
      else if (    FACE_RE.test(line) )
      {
        var quad = false;
        for ( var j = 0, eleLen = elements.length; j < eleLen; j++ )
        {
          if ( j === 3 && !quad )
          {
            j = 2;
            quad = true;
          }
          if ( elements[j] in unpacked.hashindices )
          {
            unpacked.indices.push(unpacked.hashindices[elements[j]]);
          }
          else
          {
            var vertex = elements[j].split('/');

            unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 0]);
            unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 1]);
            unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 2]);

            if (textures.length)
            {
              unpacked.textures.push(+textures[((vertex[1] - 1) || vertex[0]) * 2 + 0]);
              unpacked.textures.push(+textures[((vertex[1] - 1) || vertex[0]) * 2 + 1]);
            }

            unpacked.norms.push(+vertNormals[((vertex[2] - 1) || vertex[0]) * 3 + 0]);
            unpacked.norms.push(+vertNormals[((vertex[2] - 1) || vertex[0]) * 3 + 1]);
            unpacked.norms.push(+vertNormals[((vertex[2] - 1) || vertex[0]) * 3 + 2]);

            unpacked.hashindices[elements[j]] = unpacked.index;
            unpacked.indices.push(unpacked.index);
            unpacked.index += 1;
          }
          if ( j === 3 && quad )
          { 
            unpacked.indices.push( unpacked.hashindices[ elements[ 0 ] ] );
          }
        }
      }
    }
    {
      const { verts, norms, textures } = unpacked;
      for ( var j = 0; j < verts.length / 3; j++ )
      {
        this.arrays.position.push(      vec3( verts[ 3 * j ],   verts[ 3 * j + 1 ], verts[ 3 * j + 2 ] ) );
        this.arrays.normal.push(        vec3( norms[ 3 * j ],   norms[ 3 * j + 1 ], norms[ 3 * j + 2 ] ) );
        this.arrays.texture_coord.push( vec( textures[ 2 * j ], textures[ 2 * j + 1 ] ) );
      }
      this.indices = unpacked.indices;
    }
    this.normalize_positions( false );
    this.ready = true;
  }

  draw( context, program_state, actor, material )
  {
    if ( !this.ready )
      return;

    super.draw( context, program_state, actor, material );
  }
}


export class Ground extends Shape
{
  constructor() {
    super("position", "normal", "texture_coord");
    // Specify the 4 square corner locations, and match those up with normal vectors:
    this.arrays.position = Vector3.cast([-100, 0, -100], [100, 0, -100], [-100, 0, 100], [100, 0, 100]);
    this.arrays.normal = Vector3.cast([0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]);
    // Arrange the vertices into a square shape in texture space too:
    this.arrays.texture_coord = Vector.cast([0, 0], [1, 0], [0, 1], [1, 1]);
    // Use two triangles this time, indexing into four distinct vertices:
    this.indices.push(0, 1, 2, 1, 3, 2);
  }
}

export class PBRMaterial extends Shader
{
  constructor()
  {
    super();
  }

  vertex_glsl_code()
  {
    return `
        precision highp float;
        varying vec3 f_Normal;
        varying vec2 f_UV;
        varying vec4 f_NDCPos;
        varying vec4 f_PrevNDCPos;

        attribute vec3 position;
        attribute vec3 normal;
        attribute vec2 texture_coord;

        uniform mat4 g_Model;
        uniform mat4 g_ViewProj;

        uniform mat4 g_PrevModel;
        uniform mat4 g_PrevViewProj;

        uniform vec3 g_SquaredScale;

        uniform vec3 g_TAAJitter;
        
        void main()
        {                                                                   
          vec4 ws_pos      = g_Model    * vec4( position, 1.0 );
          vec4 ndc_pos     = g_ViewProj * ws_pos;

          vec4 prev_ws_pos = g_PrevModel    * vec4( position, 1.0 );
          vec4 prev_ndc    = g_PrevViewProj * prev_ws_pos;

          f_NDCPos         = ndc_pos;
          f_PrevNDCPos     = prev_ndc;
          f_Normal         = normalize( mat3( g_Model ) * normal / g_SquaredScale );
          f_UV             = texture_coord;

          gl_Position      = ndc_pos + vec4( g_TAAJitter.xy * ndc_pos.w, 0.0, 0.0 );
        } `;
  }

  fragment_glsl_code()
  {
    return `
      #extension GL_EXT_draw_buffers : require
      precision highp float;

      varying vec3  f_Normal;
      varying vec2  f_UV;
      varying vec4  f_NDCPos;
      varying vec4  f_PrevNDCPos;

      uniform vec3  g_Diffuse;
      uniform float g_Roughness;
      uniform float g_Metallic;

      vec2 calculate_velocity(vec4 old_pos, vec4 new_pos)
      {
        old_pos   /= old_pos.w;
        old_pos.xy = (old_pos.xy + vec2(1.0, 1.0)) / 2.0;
        old_pos.y  = 1.0 - old_pos.y;

        new_pos   /= new_pos.w;
        new_pos.xy = (new_pos.xy + vec2(1.0, 1.0)) / 2.0;
        new_pos.y  = 1.0 - new_pos.y;

        vec2 velocity = (new_pos - old_pos).xy;
        velocity.x   *= -1.0;
        return velocity;
      }

      void main()
      {                                                           
        // TODO(bshihabi): We'll add texture mapping soon.
        vec3  diffuse    = g_Diffuse;
        vec3  normal     = normalize( f_Normal );
        float roughness  = g_Roughness;
        float metallic   = g_Metallic;

        vec2  velocity   = calculate_velocity( f_PrevNDCPos, f_NDCPos );

        gl_FragData[ 0 ] = vec4( diffuse,  metallic );
        gl_FragData[ 1 ] = vec4( f_Normal, roughness );
        gl_FragData[ 2 ] = vec4( velocity, 0.0, 0.0 );
      } `;
  }

  send_material( gl, gpu, material )
  {
    // gl.uniform1f(gpu.smoothness, material.smoothness);
    gl.uniform3fv( gpu.g_Diffuse,   material.diffuse.to3() );
    gl.uniform1f(  gpu.g_Roughness, material.roughness );
    gl.uniform1f(  gpu.g_Metallic,  material.metallic );
  }

  send_gpu_state( gl, gpu, gpu_state, actor )
  {
    // Use the squared scale trick from "Eric's blog" instead of inverse transpose matrix:
    const squared_scale = actor.transform.reduce(
        ( acc, r ) =>
        {
            return acc.plus( vec4( ...r ).times_pairwise( r ) )
        }, vec4( 0, 0, 0, 0 )).to3();
    gl.uniform3fv( gpu.g_SquaredScale, squared_scale );

    gl.uniform3fv( gpu.g_TAAJitter, gpu_state.taa_jitter );

    const view_proj = gpu_state.projection_transform.times( gpu_state.camera_inverse );
    gl.uniformMatrix4fv( gpu.g_Model, false, Matrix.flatten_2D_to_1D( actor.transform.transposed() ) );
    gl.uniformMatrix4fv( gpu.g_ViewProj, false, Matrix.flatten_2D_to_1D( view_proj.transposed() ) );

    const prev_view_proj = gpu_state.prev_projection.times( gpu_state.prev_camera_inverse );
    gl.uniformMatrix4fv( gpu.g_PrevModel, false, Matrix.flatten_2D_to_1D( actor.prev_transform.transposed() ) );
    gl.uniformMatrix4fv( gpu.g_PrevViewProj, false, Matrix.flatten_2D_to_1D( prev_view_proj.transposed() ) );
  }

  update_GPU( context, gpu_addresses, gpu_state, actor, material )
  {
    // update_GPU(): Define how to synchronize our JavaScript's variables to the GPU's.  This is where the shader
    // recieves ALL of its inputs.  Every value the GPU wants is divided into two categories:  Values that belong
    // to individual objects being drawn (which we call "Material") and values belonging to the whole scene or
    // program (which we call the "Program_State").  Send both a material and a program state to the shaders
    // within this function, one data field at a time, to fully initialize the shader for a draw.

    // Fill in any missing fields in the Material object with custom defaults for this shader:
    const defaults = { diffuse: vec3( 1, 1, 1 ), roughness: 0.2, metallic: 0.01 };
    material = Object.assign( {}, defaults, material );

    this.send_material( context, gpu_addresses, material );
    this.send_gpu_state( context, gpu_addresses, gpu_state, actor );
  }
}

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
      uniform sampler2D g_ShadowMapDirectional;

      uniform mat4      g_InverseViewProj;
      uniform vec3      g_DirectionalLightDirection;
      uniform vec3      g_DirectionalLightChromaticity;
      uniform float     g_DirectionalLightLuminance;

      uniform vec3      g_SpotLightDirection;
      uniform vec3      g_SpotLightPosition;
      uniform vec3      g_SpotLightChromaticity;
      uniform float     g_SpotLightLuminance;
      uniform float     g_SpotLightInnerCutoff;
      uniform float     g_SpotLightOuterCutoff;

      uniform mat4      g_DirectionalLightViewProj;

      uniform vec3      g_WSCameraPosition;
      uniform vec3      g_SkyColor;

      uniform bool      g_EnablePCF;

      varying vec2      f_UV;
      
      const float kPI  = 3.1415926535897932;

      // NOTE(bshihabi): A lot of this lighting shader is taken from my own personal renderer
      // Mostly translated from HLSL to GLSL
      float distribution_ggx( float NdotH, float roughness )
      {
        float a      = roughness * roughness;
        float a2     = a * a;
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

      float geometry_smith( float NdotV, float NdotL, float roughness )
      {
        float ggx2  = geometry_schlick_ggx( NdotV, roughness );
        float ggx1  = geometry_schlick_ggx( NdotL, roughness );

        return ggx1 * ggx2;
      }

      vec3 fresnel_schlick( float HdotV, vec3 f0 )
      {
        return f0 + ( vec3( 1.0, 1.0, 1.0 ) - f0 ) * pow( max( 1.0 - HdotV, 0.0 ), 5.0 );
      }

      // Rendering Equation: ∫ fᵣ(x,ωᵢ,ωₒ,λ,t) Lᵢ(x,ωᵢ,ωₒ,λ,t) (ωᵢ⋅n̂) dωᵢ

      vec3 evaluate_directional_radiance( vec3 light_diffuse, float light_intensity )
      {
        return light_diffuse * light_intensity;
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

        float  NdotV     = max( dot( normal, view_direction ),         0.0 );
        float  NdotH     = max( dot( normal, halfway_vector ),         0.0 );
        float  HdotV     = max( dot( halfway_vector, view_direction ), 0.0 );
        float  NdotL     = max( dot( normal, light_direction ),        0.0 );

        // Cook torrance BRDF
        float  D         = distribution_ggx( NdotH, roughness );
        float  G         = geometry_smith( NdotV, NdotL, roughness );
        vec3   F         = fresnel_schlick( HdotV, f0 );

        vec3   kS         = F;
        vec3   kD         = vec3( 1.0, 1.0, 1.0 ) - kS;
        kD               *= 1.0 - metallic;

        vec3  numerator   = D * G * F;
        float denominator = 4.0 * NdotV * NdotL;
        vec3  specular    = numerator / max( denominator, 0.001 );

        return ( ( kD * diffuse + specular ) * radiance * NdotL ) / kPI;
      }

      vec3 evaluate_spot_light(
        vec3  light_position,
        vec3  light_direction,
        vec3  light_diffuse,
        float light_intensity,
        float light_inner_cutoff,
        float light_outer_cutoff,
        vec3  ws_pos,
        vec3  view_direction,
        vec3  normal,
        float roughness,
        float metallic,
        vec3  diffuse
      ) {
        vec3 L               = normalize( light_position - ws_pos );

        // The light direction from the fragment position
        vec3 halfway_vector  = normalize( view_direction + L );

        // Attenuate by spotlight
        light_direction      = -normalize( light_direction );
        float theta          = dot( L, light_direction );
        float epsilon        = light_inner_cutoff - light_outer_cutoff;
        float spot_atten     = clamp( ( theta - light_outer_cutoff ) / epsilon, 0.0, 1.0 ) ;

        // Add the radiance
        vec3 radiance        = light_diffuse * light_intensity * spot_atten;

        // Surface reflection at 0 incidence
        vec3   f0        = vec3( 0.04, 0.04, 0.04 );
        f0               = mix( f0, diffuse, metallic );

        float  NdotV     = max( dot( normal, view_direction ),         0.0 );
        float  NdotH     = max( dot( normal, halfway_vector ),         0.0 );
        float  HdotV     = max( dot( halfway_vector, view_direction ), 0.0 );
        float  NdotL     = max( dot( normal, L ),                      0.0 );

        // Cook torrance BRDF
        float  D         = distribution_ggx( NdotH, roughness );
        float  G         = geometry_smith( NdotV, NdotL, roughness );
        vec3   F         = fresnel_schlick( HdotV, f0 );

        vec3   kS         = F;
        vec3   kD         = vec3( 1.0, 1.0, 1.0 ) - kS;
        kD               *= 1.0 - metallic;

        vec3  numerator   = D * G * F;
        float denominator = 4.0 * NdotV * NdotL;
        vec3  specular    = numerator / max( denominator, 0.001 );


        return ( ( kD * diffuse + specular ) * radiance * NdotL ) / kPI;
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

      float pcf_shadow( vec3 ws_pos )
      {
        vec4 dir_ls_pos  = g_DirectionalLightViewProj * vec4( ws_pos, 1.0 );
        dir_ls_pos.xyz  /= dir_ls_pos.w;
        float shadow     = 0.0;

        if ( dir_ls_pos.z <= 1.0 && dir_ls_pos.x >= -1.0 && dir_ls_pos.y >= -1.0 && dir_ls_pos.x <= 1.0 && dir_ls_pos.y <= 1.0 )
        {
          float kBias = 0.005;
          dir_ls_pos  = ( dir_ls_pos + 1.0 ) / 2.0;
          for ( int x = -1; x <= 1; x++ )
          {
            for ( int y = -1; y <= 1; y++ )
            {
              vec2  uv_offset     = vec2( x, y ) * ( 1.0 / 4096.0 );
              uv_offset          *= g_EnablePCF ? 1.0 : 0.0;
              float closest_depth = texture2D( g_ShadowMapDirectional, dir_ls_pos.xy + uv_offset ).x;
              shadow += dir_ls_pos.z > closest_depth + kBias ? 1.0 : 0.0; 
            }
          }
        }

        shadow /= 9.0;
        return shadow;
      }

      void main()
      {                                                           
        vec3  diffuse   = texture2D( g_DiffuseMetallic, f_UV ).rgb;
        float metallic  = texture2D( g_DiffuseMetallic, f_UV ).a;
        
        vec3  normal    = texture2D( g_NormalRoughness, f_UV ).rgb;
        float roughness = texture2D( g_NormalRoughness, f_UV ).a;

        float depth     = texture2D( g_Depth,           f_UV ).r;

        vec3  ws_pos      = screen_to_world( f_UV, depth ).xyz;
        vec3  view_dir    = normalize( g_WSCameraPosition.xyz - ws_pos );
        float shadow      = pcf_shadow( ws_pos );

        vec3 directional = evaluate_directional_light(
          g_DirectionalLightDirection,
          g_DirectionalLightChromaticity,
          g_DirectionalLightLuminance,
          view_dir,
          normal,
          roughness,
          metallic,
          diffuse
        );

        vec3 spot_light = evaluate_spot_light(
          g_SpotLightPosition,
          g_SpotLightDirection,
          g_SpotLightChromaticity,
          g_SpotLightLuminance,
          g_SpotLightInnerCutoff,
          g_SpotLightOuterCutoff,
          ws_pos,
          view_dir,
          normal,
          roughness,
          metallic,
          diffuse
        );

        vec3 irradiance = directional * ( 1.0 - shadow ) + spot_light;

        gl_FragColor    =  depth == 1.0 ? vec4( g_SkyColor, 1.0 ) : vec4( irradiance, 1.0 );
      } `;
  }

  update_GPU( gl, gpu_addresses, gpu_state, _,  material )
  {
    gl.activeTexture( gl.TEXTURE0 );
    gl.bindTexture( gl.TEXTURE_2D, material.diffuse_metallic );
    gl.uniform1i( gpu_addresses.g_DiffuseMetallic,      0 );

    gl.activeTexture( gl.TEXTURE1 );
    gl.bindTexture( gl.TEXTURE_2D, material.normal_roughness );
    gl.uniform1i( gpu_addresses.g_NormalRoughness,      1 );

    gl.activeTexture( gl.TEXTURE2 );
    gl.bindTexture( gl.TEXTURE_2D, material.depth );
    gl.uniform1i( gpu_addresses.g_Depth,                2 );

    gl.activeTexture( gl.TEXTURE3 );
    gl.bindTexture( gl.TEXTURE_2D, material.shadow_map_directional );
    gl.uniform1i( gpu_addresses.g_ShadowMapDirectional, 3 );

    const view_proj         = gpu_state.projection_transform.times( gpu_state.camera_inverse );
    const inverse_view_proj = Mat4.inverse( view_proj );
    gl.uniformMatrix4fv( gpu_addresses.g_InverseViewProj, false, Matrix.flatten_2D_to_1D( inverse_view_proj.transposed() ) );

    const O = vec4(0, 0, 0, 1);
    const camera_center = gpu_state.camera_transform.times(O).to3();
    gl.uniform3fv( gpu_addresses.g_WSCameraPosition, camera_center );
    gl.uniform3fv( gpu_addresses.g_SkyColor, vec3( 0.403, 0.538, 1.768 ) );

    gl.uniform1i( gpu_addresses.g_EnablePCF, gpu_state.enable_pcf ? 1 : 0 );

    if ( gpu_state.directional_light )
    {
      gl.uniform3fv( gpu_addresses.g_DirectionalLightDirection,    gpu_state.directional_light.direction );
      gl.uniform3fv( gpu_addresses.g_DirectionalLightChromaticity, gpu_state.directional_light.chromaticity );
      gl.uniform1f ( gpu_addresses.g_DirectionalLightLuminance,    gpu_state.directional_light.luminance );
      const directional_view_proj = gpu_state.directional_light_proj.times( gpu_state.directional_light_view );
      gl.uniformMatrix4fv( gpu_addresses.g_DirectionalLightViewProj, false, Matrix.flatten_2D_to_1D( directional_view_proj.transposed() ) );
    }

    if ( gpu_state.spot_light )
    {
      const inner_cutoff = Math.cos( gpu_state.spot_light.inner_cutoff );
      const outer_cutoff = Math.cos( gpu_state.spot_light.outer_cutoff );
      gl.uniform3fv( gpu_addresses.g_SpotLightPosition,     gpu_state.spot_light.position     );
      gl.uniform3fv( gpu_addresses.g_SpotLightDirection,    gpu_state.spot_light.direction    );
      gl.uniform3fv( gpu_addresses.g_SpotLightChromaticity, gpu_state.spot_light.chromaticity );
      gl.uniform1f ( gpu_addresses.g_SpotLightLuminance,    gpu_state.spot_light.luminance    );
      gl.uniform1f ( gpu_addresses.g_SpotLightInnerCutoff,  inner_cutoff                      );
      gl.uniform1f ( gpu_addresses.g_SpotLightOuterCutoff,  outer_cutoff                      );
    }
  }
}

export class TAA extends Shader
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
      uniform sampler2D g_PBRBufferPrev;
      uniform sampler2D g_GBufferVelocity;
      uniform sampler2D g_GBufferVelocityPrev;

      uniform sampler2D g_GBufferDepth;

      uniform vec3      g_Dimensions;

      varying vec2 f_UV;

      vec2 texel_to_uv( vec2 texel )
      {
        vec2 dimensions = g_Dimensions.xy;
        // texel = clamp( texel, vec2( 0.0 ), dimensions );
        texel /= dimensions;
        texel.y = 1.0 - texel.y;

        return texel;
      }

      void tap_curr_buffer(
        vec2 texel_offset,
        vec2 texel,
        inout vec3 min_color,
        inout vec3 max_color
      ) {
        vec2 uv    = texel_to_uv( texel + texel_offset );
        vec3 color = texture2D( g_PBRBuffer, uv ).rgb;
        min_color  = min( min_color, color );
        max_color  = max( max_color, color );
      }

      vec2 get_dilated_texel( vec2 texel )
      {
        float closest_depth     = 0.0;
        vec2  closest_texel_pos = texel;

        for ( int y = -1; y <= 1; y++ )
        {
          for ( int x = -1; x <= 1; x++ )
          {
            vec2 pos                 = texel + vec2( x, y );
            float neighborhood_depth = texture2D( g_GBufferDepth, texel_to_uv( pos ) ).r;

            if ( neighborhood_depth > closest_depth )
            {
              closest_texel_pos = pos;
              closest_depth     = neighborhood_depth;
            }
          }
        }

        return closest_texel_pos;
      }

      void main()
      {                                                           
        vec2 thread_id     = vec2( f_UV.x, 1.0 - f_UV.y ) * g_Dimensions.xy;
        vec2 dilated_texel = get_dilated_texel( thread_id );

        vec3 min_color_cross = vec3(  9999.0 );
        vec3 max_color_cross = vec3( -9999.0 );

        tap_curr_buffer(vec2( 0, -1), thread_id, min_color_cross, max_color_cross);
        tap_curr_buffer(vec2(-1,  0), thread_id, min_color_cross, max_color_cross);
        tap_curr_buffer(vec2( 0,  0), thread_id, min_color_cross, max_color_cross);
        tap_curr_buffer(vec2( 1,  0), thread_id, min_color_cross, max_color_cross);
        tap_curr_buffer(vec2( 0,  1), thread_id, min_color_cross, max_color_cross);

        vec3 min_color_3x3   = min_color_cross;
        vec3 max_color_3x3   = max_color_cross;

        tap_curr_buffer(vec2(-1, -1), thread_id, min_color_3x3,   max_color_3x3);
        tap_curr_buffer(vec2( 1, -1), thread_id, min_color_3x3,   max_color_3x3);
        tap_curr_buffer(vec2(-1,  1), thread_id, min_color_3x3,   max_color_3x3);
        tap_curr_buffer(vec2( 1,  1), thread_id, min_color_3x3,   max_color_3x3);

        vec3 min_color = min_color_3x3 * 0.5 + min_color_cross * 0.5;
        vec3 max_color = max_color_3x3 * 0.5 + max_color_cross * 0.5;

        vec2 uv            = texel_to_uv( thread_id );
        vec2 curr_velocity = texture2D( g_GBufferVelocity, uv ).xy;

        vec2 reproj_uv     = uv + curr_velocity;
        vec2 prev_velocity = texture2D( g_GBufferVelocityPrev, reproj_uv ).xy;

        float acceleration          = length( prev_velocity - curr_velocity );
        float velocity_disocclusion = clamp( ( acceleration - 0.001 ) * 10.0, 0.0, 1.0 );

        vec3 curr_color    = texture2D( g_PBRBuffer,     uv ).rgb;
        vec3 prev_color    = clamp( texture2D( g_PBRBufferPrev, reproj_uv ).rgb, min_color, max_color );
        vec3 accumulation  = 0.9 * prev_color + 0.1 * curr_color;
        
        gl_FragColor       = vec4( mix( accumulation, curr_color, velocity_disocclusion ), 1.0 );
      } `;
  }

  update_GPU( gl, gpu_addresses, gpu_state, _,  material )
  {
    gl.activeTexture( gl.TEXTURE0 );
    gl.bindTexture( gl.TEXTURE_2D, material.pbr_buffer );
    gl.uniform1i( gpu_addresses.g_PBRBuffer, 0 );

    gl.activeTexture( gl.TEXTURE1 );
    gl.bindTexture( gl.TEXTURE_2D, material.accumulation_buffer );
    gl.uniform1i( gpu_addresses.g_PBRBufferPrev, 1 );

    gl.activeTexture( gl.TEXTURE2 );
    gl.bindTexture( gl.TEXTURE_2D, material.gbuffer_velocity );
    gl.uniform1i( gpu_addresses.g_GBufferVelocity, 2 );

    gl.activeTexture( gl.TEXTURE3 );
    gl.bindTexture( gl.TEXTURE_2D, material.gbuffer_velocity_prev );
    gl.uniform1i( gpu_addresses.g_GBufferVelocityPrev, 3 );

    gl.activeTexture( gl.TEXTURE4 );
    gl.bindTexture( gl.TEXTURE_2D, material.gbuffer_depth );
    gl.uniform1i( gpu_addresses.g_GBufferDepth, 4 );

    gl.uniform3fv( gpu_addresses.g_Dimensions, vec3( gl.canvas.width, gl.canvas.height, 0 ) );
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

      // This is technically the worse approximation but I doubt you can tell
      // the difference.
      // https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
      vec3 aces_film(vec3 x)
      {
        float a = 2.51;
        float b = 0.03;
        float c = 2.43;
        float d = 0.59;
        float e = 0.14;
        return clamp( ( x * ( a * x + b ) ) / ( x * ( c * x + d ) + e ), 0.0, 1.0 );
      }

      vec3 transfer_function_gamma( vec3 color )
      {
        return pow( color, vec3( 1.0 / 2.2 ) );
      }

      void main()
      {                                                           
        vec3 radiometry       = texture2D( g_PBRBuffer, f_UV ).rgb;

        vec3 tonemapped       = aces_film( radiometry );
        vec3 gamma_compressed = transfer_function_gamma( tonemapped );

        gl_FragColor = vec4( gamma_compressed, 1.0 );
      } `;
  }

  update_GPU( gl, gpu_addresses, gpu_state, _,  material )
  {
    gl.activeTexture( gl.TEXTURE0 );
    gl.bindTexture( gl.TEXTURE_2D, material.pbr_buffer );
    gl.uniform1i( gpu_addresses.g_PBRBuffer, 0 );
  }
}

function orthographic_proj( left, right, bottom, top, near, far )
{
  return Mat4.scale(1 / (right - left), 1 / (top - bottom), 1 / (far - near))
      .times(Mat4.translation(-left - right, -top - bottom, -near - far))
      .times(Mat4.scale(2, 2, -2));
}

export class Renderer 
{
  constructor( gl )
  {
    this.gl = gl;
    const draw_buffers_ext = gl.getExtension( "WEBGL_draw_buffers" );
    if ( !draw_buffers_ext )
    {
      alert( "Need WEBGL_draw_buffers extension!" );
    }

    const depth_texture_ext = gl.getExtension( "WEBGL_depth_texture" );
    if ( !depth_texture_ext )
    {
      alert( "Need WEBGL_depth_texture extension!" );
    }

    const float_texture_ext = gl.getExtension( "OES_texture_float" );
    if ( !float_texture_ext )
    {
      alert( "Need OES_texture_float extension!" );
    }

    const float_bilinear_ext = gl.getExtension( "OES_texture_float_linear" );
    if ( !float_bilinear_ext )
    {
      alert( "Need OES_texture_float_linear extension!" );
    }

    this.render_buffers = new Array( RenderBuffers.kCount );
    this.init_gbuffer( draw_buffers_ext );
    this.init_shadow_maps();
    this.init_pbr_buffer();
    this.init_taa_buffer();
    this.init_post_processing_buffer();

    this.quad = new defs.Square();

    this.standard_brdf   = new Material( new StandardBrdf(), {
      diffuse_metallic:       this.render_buffers[ RenderBuffers.kGBufferDiffuseMetallic ],
      normal_roughness:       this.render_buffers[ RenderBuffers.kGBufferNormalRoughness ],
      depth:                  this.render_buffers[ RenderBuffers.kGBufferDepth           ],
      shadow_map_directional: this.render_buffers[ RenderBuffers.kShadowMapSun           ],
    } );
    this.taa             = new Material( new TAA(),              { 
      pbr_buffer:            this.render_buffers[ RenderBuffers.kPBRLighting         ],
      accumulation_buffer:   this.render_buffers[ RenderBuffers.kAccumulation        ],
      gbuffer_velocity:      this.render_buffers[ RenderBuffers.kGBufferVelocity     ],
      gbuffer_velocity_prev: this.render_buffers[ RenderBuffers.kGBufferVelocityPrev ],
      gbuffer_depth:         this.render_buffers[ RenderBuffers.kGBufferDepth        ],
    } );
    this.post_processing = new Material( new PostProcessing(),   { pbr_buffer: this.render_buffers[ RenderBuffers.kTAA            ] } );
    this.blit            = new Material( new FullscreenShader(), { texture:    this.render_buffers[ RenderBuffers.kPostProcessing ] } );
    this.blit_buffer     = RenderBuffers.kPostProcessing;
    this.frame_id        = 0;
    this.enable_taa      = true;
    this.enable_pcf      = true;
  }

  get_taa_jitter()
  {
    const kHaltonSequence =
    [
      vec( 0.500000, 0.333333 ),
      vec( 0.250000, 0.666667 ),
      vec( 0.750000, 0.111111 ),
      vec( 0.125000, 0.444444 ),
      vec( 0.625000, 0.777778 ),
      vec( 0.375000, 0.222222 ),
      vec( 0.875000, 0.555556 ),
      vec( 0.062500, 0.888889 ),
      vec( 0.562500, 0.037037 ),
      vec( 0.312500, 0.370370 ),
      vec( 0.812500, 0.703704 ),
      vec( 0.187500, 0.148148 ),
      vec( 0.687500, 0.481481 ),
      vec( 0.437500, 0.814815 ),
      vec( 0.937500, 0.259259 ),
      vec( 0.031250, 0.592593 ),
    ];

    const idx = this.frame_id % kHaltonSequence.length;
    let   ret = kHaltonSequence[ idx ].minus( vec( 0.5, 0.5 ) ).times_pairwise( vec( 2.0 / this.gl.canvas.width, 2.0 / this.gl.canvas.height) );
    return ret.to3();
  }

  cycle_blit_buffer()
  {
    this.blit_buffer = ( this.blit_buffer + 1 ) % RenderBuffers.kCount;
    this.blit        = new Material( new FullscreenShader(), { texture: this.render_buffers[ this.blit_buffer ] } );
    console.log( this.blit_buffer );
  }

  init_gbuffer( draw_buffers_ext )
  {
    const gl = this.gl;

    this.gbuffer = gl.createFramebuffer();
    
    this.render_buffers[ RenderBuffers.kGBufferDiffuseMetallic ] = gl.createTexture();
    this.render_buffers[ RenderBuffers.kGBufferNormalRoughness ] = gl.createTexture();
    this.render_buffers[ RenderBuffers.kGBufferVelocity        ] = gl.createTexture();
    this.render_buffers[ RenderBuffers.kGBufferDepth           ] = gl.createTexture();

    gl.bindTexture( gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kGBufferDiffuseMetallic ] );
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.FLOAT, null );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE );

    gl.bindTexture( gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kGBufferNormalRoughness ] );
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.FLOAT, null );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE );

    gl.bindTexture( gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kGBufferVelocity ] );
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA,  gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.FLOAT, null );
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

    let framebuffer_status = gl.checkFramebufferStatus( gl.FRAMEBUFFER );
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

    this.velocity_prev = gl.createFramebuffer();
    this.render_buffers[ RenderBuffers.kGBufferVelocityPrev ] = gl.createTexture();

    gl.bindTexture( gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kGBufferVelocityPrev ] );
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA,  gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.FLOAT, null );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE );

    gl.bindFramebuffer( gl.FRAMEBUFFER, this.velocity_prev );
    gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kGBufferVelocityPrev ], 0 );

    framebuffer_status = gl.checkFramebufferStatus( gl.FRAMEBUFFER );
    if ( framebuffer_status !== gl.FRAMEBUFFER_COMPLETE )
    {
      alert( "Failed to create Velocity Prev!" );
    }

    gl.bindTexture( gl.TEXTURE_2D, null );
    gl.bindFramebuffer( gl.FRAMEBUFFER, null );
  }

  init_pbr_buffer()
  {
    const gl = this.gl;

    this.pbr_buffer = gl.createFramebuffer();
    
    this.render_buffers[ RenderBuffers.kPBRLighting  ] = gl.createTexture();

    gl.bindTexture( gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kPBRLighting ] );
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.FLOAT, null );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE );

    gl.bindFramebuffer( gl.FRAMEBUFFER, this.pbr_buffer );
    gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kPBRLighting  ], 0 );

    let framebuffer_status = gl.checkFramebufferStatus( gl.FRAMEBUFFER );
    if ( framebuffer_status !== gl.FRAMEBUFFER_COMPLETE )
    {
      alert( "Failed to create PBR Buffer!" );
    }

    gl.bindTexture( gl.TEXTURE_2D, null );
    gl.bindFramebuffer( gl.FRAMEBUFFER, null );
  }

  init_taa_buffer()
  {
    const gl = this.gl;

    this.taa_buffer = gl.createFramebuffer();
    
    this.render_buffers[ RenderBuffers.kTAA ] = gl.createTexture();

    gl.bindTexture( gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kTAA ] );
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.FLOAT, null );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE );

    gl.bindFramebuffer( gl.FRAMEBUFFER, this.taa_buffer );
    gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kTAA  ], 0 );

    let framebuffer_status = gl.checkFramebufferStatus( gl.FRAMEBUFFER );
    if ( framebuffer_status !== gl.FRAMEBUFFER_COMPLETE )
    {
      alert( "Failed to create TAA Buffer!" );
    }

    this.accumulation_buffer = gl.createFramebuffer();

    this.render_buffers[ RenderBuffers.kAccumulation ] = gl.createTexture();

    gl.bindTexture( gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kAccumulation ] );
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.FLOAT, null );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE );

    gl.bindFramebuffer( gl.FRAMEBUFFER, this.accumulation_buffer );
    gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kAccumulation ], 0 );

    framebuffer_status = gl.checkFramebufferStatus( gl.FRAMEBUFFER );
    if ( framebuffer_status !== gl.FRAMEBUFFER_COMPLETE )
    {
      alert( "Failed to create accumulation buffer!" );
    }
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

    gl.bindFramebuffer( gl.FRAMEBUFFER, this.post_processing_buffer );
    gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kPostProcessing ], 0 );

    const framebuffer_status = gl.checkFramebufferStatus( gl.FRAMEBUFFER );
    if ( framebuffer_status !== gl.FRAMEBUFFER_COMPLETE )
    {
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
    gl.texImage2D( gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, kShadowMapSize, kShadowMapSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER,   gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER,   gl.LINEAR );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,       gl.CLAMP_TO_EDGE );
    gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,       gl.CLAMP_TO_EDGE );


    gl.bindFramebuffer( gl.FRAMEBUFFER, this.directional_shadow_map );
    gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,  gl.TEXTURE_2D, this.render_buffers[ RenderBuffers.kShadowMapSun ], 0 );

    let framebuffer_status = gl.checkFramebufferStatus( gl.FRAMEBUFFER );
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
    gl.disable( gl.BLEND );

    for ( let iactor = 0; iactor < actors.length; iactor++ )
    {
      const actor = actors[ iactor ];
      if ( !actor.mesh || !actor.material )
        continue;
      if ( !actor.prev_transform )
      {
        actor.prev_transform = actor.transform;
      }
      actor.mesh.draw( context, program_state, actor, actor.material );
      actor.prev_transform = actor.transform;
    }
  }


  render_handler_directional_shadow( context, program_state, actors )
  {
    const gl = this.gl;

    gl.bindFramebuffer( gl.FRAMEBUFFER, this.directional_shadow_map );
    gl.viewport( 0, 0, kShadowMapSize, kShadowMapSize );
    gl.clear( gl.DEPTH_BUFFER_BIT );
    gl.depthFunc( gl.LESS );

    if ( !program_state.directional_light )
      return;


    const camera_center = program_state.camera_transform.times( vec4( 0, 0, -40, 1 ) ).to3();
    program_state.directional_light_view = Mat4.look_at(
      camera_center.plus( program_state.directional_light.direction.normalized().times( -40 ) ),
      camera_center,
      vec3( 0, 1, 0 )
    );
    program_state.directional_light_proj = orthographic_proj( -35, 35, -35, 35, 0.1, 75 );

    const orig_view = Mat4.identity().times(program_state.camera_inverse);
    const orig_proj = Mat4.identity().times(program_state.projection_transform);

    program_state.set_camera( program_state.directional_light_view );
    program_state.projection_transform = program_state.directional_light_proj;

    for ( let iactor = 0; iactor < actors.length; iactor++ )
    {
      const actor = actors[ iactor ];
      if ( !actor.mesh || !actor.material )
        continue;
      actor.mesh.draw( context, program_state, actor, actor.material );
    }

    program_state.set_camera( orig_view );
    program_state.projection_transform = orig_proj;
  }

  render_handler_spot_shadow( context, program_state, actors )
  {
    const gl = this.gl;

    gl.bindFramebuffer( gl.FRAMEBUFFER, this.directional_shadow_map );
    gl.viewport( 0, 0, kShadowMapSize, kShadowMapSize );
    gl.clear( gl.DEPTH_BUFFER_BIT );
    gl.depthFunc( gl.LESS );

    if ( !program_state.directional_light )
      return;


    program_state.spot_light_view = Mat4.look_at(
      program_state.spot_light.position,
      program_state.spot_light.position.plus( program_state.spot_light.direction ),
      vec3( 0, 1, 0 )
    );
    program_state.spot_light_proj = Mat4.perspective( program_state.spot_light.outer_cutoff, 1, 0.01, 1000.0 );

    const orig_view = Mat4.identity().times(program_state.camera_inverse);
    const orig_proj = Mat4.identity().times(program_state.projection_transform);

    program_state.set_camera( program_state.directional_light_view );
    program_state.projection_transform = program_state.directional_light_proj;

    for ( let iactor = 0; iactor < actors.length; iactor++ )
    {
      const actor = actors[ iactor ];
      if ( !actor.mesh || !actor.material )
        continue;
      actor.mesh.draw( context, program_state, actor, actor.material );
    }

    program_state.set_camera( orig_view );
    program_state.projection_transform = orig_proj;
  }

  render_handler_lighting( context, program_state, actors )
  {
    const gl = this.gl;

    gl.bindFramebuffer( gl.FRAMEBUFFER, this.pbr_buffer );
    gl.viewport( 0, 0, gl.canvas.width, gl.canvas.height );
    gl.clearColor( 0.7578125, 0.81640625, 0.953125, 1.0 );
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );

    gl.depthFunc( gl.ALWAYS );
    this.quad.draw( context, program_state, null, this.standard_brdf );
  }

  render_handler_taa( context, program_state )
  {
    const gl = this.gl;

    gl.bindFramebuffer( gl.FRAMEBUFFER, this.taa_buffer );
    gl.viewport( 0, 0, gl.canvas.width, gl.canvas.height );
    gl.clearColor( 0.7578125, 0.81640625, 0.953125, 1.0 );
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );

    gl.depthFunc( gl.ALWAYS );
    if ( this.enable_taa )
    {
      this.quad.draw( context, program_state, null, this.taa );
    }
    else
    {
      this.quad.draw( context, program_state, null, this.blit.override( { texture: this.render_buffers[ RenderBuffers.kPBRLighting ] } ) );
    }
  }

  render_handler_post_processing( context, program_state )
  {
    const gl = this.gl;

    gl.bindFramebuffer( gl.FRAMEBUFFER, this.post_processing_buffer );
    gl.viewport( 0, 0, gl.canvas.width, gl.canvas.height );
    gl.clearColor( 0.0, 0.0, 0.0, 0.0 );
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
    gl.depthFunc( gl.ALWAYS );

    this.quad.draw( context, program_state, null, this.post_processing );
  }

  render_handler_copy_temporal( context, program_state )
  {
    const gl = this.gl;
    gl.bindFramebuffer( gl.FRAMEBUFFER, this.accumulation_buffer );
    gl.viewport( 0, 0, gl.canvas.width, gl.canvas.height );
    gl.clearColor( 0.0, 0.0, 0.0, 0.0 );
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
    gl.depthFunc( gl.ALWAYS );

    this.quad.draw( context, program_state, null, this.blit.override( { texture: this.render_buffers[ RenderBuffers.kTAA ] } ) );

    gl.bindFramebuffer( gl.FRAMEBUFFER, this.velocity_prev );
    gl.viewport( 0, 0, gl.canvas.width, gl.canvas.height );
    gl.clearColor( 0.0, 0.0, 0.0, 0.0 );
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
    gl.depthFunc( gl.ALWAYS );

    this.quad.draw( context, program_state, null, this.blit.override( { texture: this.render_buffers[ RenderBuffers.kGBufferVelocity ] } ) );
  }

  render_handler_blit( context, program_state )
  {
    const gl = this.gl;

    gl.bindFramebuffer( gl.FRAMEBUFFER, null );
    gl.viewport( 0, 0, gl.canvas.width, gl.canvas.height );
    gl.clearColor( 0.0, 0.0, 0.0, 0.0 );
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
    gl.depthFunc( gl.ALWAYS );

    this.quad.draw( context, program_state, null, this.blit );
  }

  submit( context, program_state, actors )
  {
    const gl = this.gl;

    if ( !program_state.prev_projection )
    {
      program_state.prev_projection     = program_state.projection_transform;
    }

    if ( !program_state.prev_camera_inverse )
    {
      program_state.prev_camera_inverse = Mat4.identity().times( program_state.camera_inverse );
    }

    if ( this.enable_taa )
    {
      program_state.taa_jitter = this.get_taa_jitter();
    }
    else
    {
      program_state.taa_jitter = vec3( 0, 0, 0 );
    }

    this.render_handler_gbuffer( context, program_state, actors );

    program_state.prev_projection     = program_state.projection_transform;
    program_state.prev_camera_inverse = Mat4.identity().times( program_state.camera_inverse );
      
    program_state.taa_jitter = vec3( 0, 0, 0 )
    this.render_handler_directional_shadow( context, program_state, actors );
    program_state.enable_pcf = this.enable_pcf;
    this.render_handler_lighting(           context, program_state, actors );
    this.render_handler_taa( context, program_state );
    this.render_handler_copy_temporal( context, program_state );
    this.render_handler_post_processing(    context, program_state, actors );
    this.render_handler_blit(               context, program_state, actors );

    this.frame_id++;
  }
};
