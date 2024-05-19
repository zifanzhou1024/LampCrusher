// Lamp source
// https://www.cgtrader.com/free-3d-models/furniture/lamp/pixar-lamp-518a1299-ae8f-4847-ba1a-110d4f68d172
import {defs, tiny} from './examples/common.js';

import { Renderer } from './renderer.js'

const {
    Vector, Vector3, vec, vec3, vec4, color, hex_color, Matrix, Mat4, Light, Shape, Material, Scene, Shader,
} = tiny;

export class Actor
{
  constructor()
  {
    this.transform = Mat4.identity();
    this.mesh      = null;
    this.material  = null;
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

  draw( context, program_state, model_transform, material )
  {
    if ( !this.ready )
      return;

    super.draw( context, program_state, model_transform, material );
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
        varying vec3 f_WorldPos;

        attribute vec3 position;
        attribute vec3 normal;
        attribute vec2 texture_coord;

        uniform mat4 g_Model;
        uniform mat4 g_ViewProj;
        uniform vec3 g_SquaredScale;
        
        void main()
        {                                                                   
          vec4 world_pos = g_Model    * vec4( position, 1.0 );
          vec4 ndc_pos   = g_ViewProj * world_pos;

          // vec4 curr_pos  = ndc_pos;
          // vec4 prev_pos  = prev_view_proj * prev_world_pos;

          /// mat3 normal_matrix = transpose( inverse( g_Model ) );
          f_Normal           = normalize( mat3( g_Model ) * normal / g_SquaredScale );
          f_UV               = texture_coord;
          f_WorldPos         = world_pos.xyz;

          gl_Position        = ndc_pos;
        } `;
  }

  fragment_glsl_code()
  {
    return `
      // #extension GL_EXT_draw_buffers : require
      precision highp float;

      varying vec3  f_Normal;
      varying vec2  f_UV;
      varying vec3  f_WorldPos;

      uniform vec3  g_DirectionalLightDirection;
      uniform vec3  g_DirectionalLightChromaticity;
      uniform float g_DirectionalLightLuminance;

      uniform vec3  g_WSCameraPosition;
      
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

      vec4 encode_normal(vec3 normal)
      {
        normal = normalize( normal );
        vec2 n = normal.xy;
        n      = n / 2.0 + 0.5;

        vec4 ret;
        ret.r = floor( n.x * 255.0 );
        ret.g = floor( fract( n.x * 255.0 ) * 255.0 );
        ret.b = floor( n.y * 255.0 );
        ret.a = floor( fract( n.y * 255.0 ) * 255.0 );
        return ret / 255.0;
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
        // TODO(bshihabi): We'll add texture mapping soon.
        vec3  diffuse   = vec3( 1.0 );
        vec3  normal    = f_Normal;
        float roughness = 0.5;
        float metallic  = 1.0;

        vec3  velocity  = vec3( 0.0, 0.0, 0.0 );

        /*
        gl_FragData[ 0 ] = vec4( diffuse,   metallic );
        gl_FragData[ 1 ] = encode_normal( normal ); // vec4( decode_normal( encode_normal( normal ) ), 1.0 );
        gl_FragData[ 2 ] = vec4( velocity, roughness );
        */
        vec3 view_dir    = g_WSCameraPosition.xyz - f_WorldPos;

        vec3 lambertian  = evaluate_lambertian( diffuse );

        vec3 directional = evaluate_directional_light(
          vec3( 1.0, -1.0, 1.0 ),
          vec3( 1.0, 1.0, 1.0 ),
          10.0,
          view_dir,
          normal,
          0.2,
          0.0,
          vec3( 1.0, 1.0, 1.0 )
        );

        vec3 irradiance = directional;
        vec3 ambient    = vec3( 0.1, 0.1, 0.1 );

        gl_FragColor    = vec4( ambient + lambertian * irradiance, 1.0 );
      } `;
  }

  send_material( gl, gpu, material )
  {
    // gl.uniform1f(gpu.smoothness, material.smoothness);
  }

  send_gpu_state( gl, gpu, gpu_state, model_transform )
  {
    // Use the squared scale trick from "Eric's blog" instead of inverse transpose matrix:
    const squared_scale = model_transform.reduce(
        ( acc, r ) =>
        {
            return acc.plus( vec4( ...r ).times_pairwise( r ) )
        }, vec4( 0, 0, 0, 0 )).to3();
    gl.uniform3fv( gpu.g_SquaredScale, squared_scale );

    const view_proj = gpu_state.projection_transform.times(gpu_state.camera_inverse);
    gl.uniformMatrix4fv( gpu.g_Model, false, Matrix.flatten_2D_to_1D( model_transform.transposed() ) );
    gl.uniformMatrix4fv( gpu.g_ViewProj, false, Matrix.flatten_2D_to_1D( view_proj.transposed() ) );

    if ( gpu_state.lights.length <= 0 )
      return;

    const directional_light_direction    = vec3( 0.0, -1.0, 0.0 );
    const directional_light_chromaticity = vec3( 1.0, 1.0, 1.0 );
    const directional_light_luminance    = 10.0;
    gl.uniform3fv( gpu.g_DirectionalLightDirection,    directional_light_direction );
    gl.uniform3fv( gpu.g_DirectionalLightChromaticity, directional_light_chromaticity );
    gl.uniform1f ( gpu.g_DirectionalLightLuminance,    directional_light_luminance );
    const O = vec4(0, 0, 0, 1);
    const camera_center = gpu_state.camera_transform.times(O).to3();
    gl.uniform3fv( gpu.g_WSCameraPosition, camera_center );
  }

  update_GPU( context, gpu_addresses, gpu_state, model_transform, material )
  {
    // update_GPU(): Define how to synchronize our JavaScript's variables to the GPU's.  This is where the shader
    // recieves ALL of its inputs.  Every value the GPU wants is divided into two categories:  Values that belong
    // to individual objects being drawn (which we call "Material") and values belonging to the whole scene or
    // program (which we call the "Program_State").  Send both a material and a program state to the shaders
    // within this function, one data field at a time, to fully initialize the shader for a draw.

    // Fill in any missing fields in the Material object with custom defaults for this shader:
    const defaults = { color: color( 0, 0, 0, 1 ), ambient: 0, diffusivity: 1, specularity: 1, smoothness: 40 };
    material = Object.assign( {}, defaults, material );

    this.send_material( context, gpu_addresses, material );
    this.send_gpu_state( context, gpu_addresses, gpu_state, model_transform );
  }
}

export class LampCrusher extends Scene
{
  constructor()
  {
    super();
    this.materials = {
        plastic: new Material(new defs.Phong_Shader(),
            {ambient: .4, diffusivity: .6, color: hex_color("#ffffff")}),
        pbr: new Material(new PBRMaterial(),
            {ambient: .4, diffusivity: .6, color: hex_color("#ffffff")}),
    };

    this.renderer      = null;

    this.lamp          = new Actor();
    this.lamp.mesh     = new Mesh( "./assets/lamp.obj" );
    this.lamp.material = this.materials.pbr;

    this.ground           = new Actor();
    this.ground.mesh      = new defs.Cube();
    this.ground.material  = this.materials.pbr;
    this.ground.transform = Mat4.scale( 100.0, 1.0, 100.0 ).times( Mat4.translation( 0, -2, 0 ) );

    this.actors        = [ this.lamp, this.ground ];
  }

  make_control_panel()
  {
  }

  display(context, program_state)
  {
    if ( !this.renderer )
    {
      const gl  = context.context;
      this.renderer = new Renderer( gl );
    }

    if ( !context.scratchpad.controls )
    {
      this.children.push( context.scratchpad.controls = new defs.Movement_Controls() );
      // Define the global camera and projection matrices, which are stored in program_state.
      program_state.set_camera( Mat4.translation( 5, -10, -30 ) );
    }

    program_state.projection_transform = Mat4.perspective(
        Math.PI / 4, context.width / context.height, 1, 100 );

    // *** Lights: *** Values of vector or point lights.
    const light_position = vec4(0, 5, 5, 1);
    program_state.lights = [ new Light( light_position, color( 1, 1, 1, 1 ), 1000 ) ];
    
    // this.lamp.transform = this.lamp.transform.times( Mat4.rotation( 0.1, 0.0, 1.0, 0.0 ) );
    
    this.renderer.submit( context, program_state, this.actors )

    // this.lamp.draw( context, program_state, Mat4.identity(), this.materials.gbuffer );
  }
}