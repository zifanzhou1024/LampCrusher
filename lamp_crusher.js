// Lamp source
// https://www.cgtrader.com/free-3d-models/furniture/lamp/pixar-lamp-518a1299-ae8f-4847-ba1a-110d4f68d172
import {defs, tiny} from './examples/common.js';

import { Renderer, DirectionalLight, Mesh, Ground, PBRMaterial } from './renderer.js'

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

export class LampCrusher extends Scene
{
  constructor()
  {
    super();
    this.materials = {
        plastic: new Material(new defs.Phong_Shader(),
            {ambient: .4, diffusivity: .6, color: hex_color("#ffffff")}),
        pbr: new Material(new PBRMaterial(),
            {diffuse: hex_color("#ffffff")}),
    };

    this.renderer           = null;


    this.lamp               = new Actor();
    this.lamp.mesh          = new Mesh( "./assets/lamp.obj" );
    this.lamp.material      = new Material(new PBRMaterial(), { diffuse: hex_color("#ffffff"), roughness: 0.2, metallic: 0.25 });

    this.ground             = new Actor();
    this.ground.mesh        = new Ground();
    this.ground.material    = new Material(new PBRMaterial(), { diffuse: hex_color("#c2d1f4"), roughness: 1.0, metallic: 0.1 });
    this.ground.transform   = Mat4.translation( 0, -2.5, 0 );

    this.letter_p           = new Actor();
    this.letter_p.mesh      = new Mesh("./assets/pixar_p.obj");
    this.letter_p.material  = new Material(new PBRMaterial(), { diffuse: hex_color("#000000"), roughness: 1.0, metallic: 0.1 });
    this.letter_p.transform = Mat4.translation( -10, -1, 30 );

    this.letter_i           = new Actor();
    this.letter_i.mesh      = new Mesh("./assets/pixar_i.obj");
    this.letter_i.material  = new Material(new PBRMaterial(), { diffuse: hex_color("#000000"), roughness: 1.0, metallic: 0.1 });
    this.letter_i.transform = Mat4.translation( -10, -1.5, 15 ); // idk wtf happened with the import honestly

    this.letter_x           = new Actor();
    this.letter_x.mesh      = new Mesh("./assets/pixar_x.obj");
    this.letter_x.material  = new Material(new PBRMaterial(), { diffuse: hex_color("#000000"), roughness: 1.0, metallic: 0.1 });
    this.letter_x.transform = Mat4.translation( -10, -1, 0 );

    this.letter_a           = new Actor();
    this.letter_a.mesh      = new Mesh("./assets/pixar_a.obj");
    this.letter_a.material  = new Material(new PBRMaterial(), { diffuse: hex_color("#000000"), roughness: 1.0, metallic: 0.1 });
    this.letter_a.transform = Mat4.translation( -10, -1, -15 );

    this.letter_r           = new Actor();
    this.letter_r.mesh      = new Mesh("./assets/pixar_r.obj");
    this.letter_r.material  = new Material(new PBRMaterial(), { diffuse: hex_color("#000000"), roughness: 1.0, metallic: 0.1 });
    this.letter_r.transform = Mat4.translation( -10, -1, -30 );

    this.actors        = [ this.lamp, this.ground, this.letter_p, this.letter_i, this.letter_x, this.letter_a, this.letter_r ];
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
    program_state.directional_light = new DirectionalLight( vec3( -1, -1, 1 ), vec3( 1, 1, 1 ), 20 );
    
    /*
      TODO: GAME LOGIC GOES HERE
    */

    this.renderer.submit( context, program_state, this.actors )
  }
}