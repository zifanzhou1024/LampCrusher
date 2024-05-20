// Lamp source
// https://www.cgtrader.com/free-3d-models/furniture/lamp/pixar-lamp-518a1299-ae8f-4847-ba1a-110d4f68d172
import {defs, tiny} from './examples/common.js';

import { Renderer, Mesh, Ground, PBRMaterial } from './renderer.js'

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

    this.renderer      = null;

    this.lamp          = new Actor();
    this.lamp.mesh     = new Mesh( "./assets/lamp.obj" );
    this.lamp.material = new Material(new PBRMaterial(), { diffuse: hex_color("#ffffff"), roughness: 0.1, metallic: 0.5 });

    this.ground           = new Actor();
    this.ground.mesh      = new Ground();
    this.ground.material  = new Material(new PBRMaterial(), { diffuse: hex_color("#c2d1f4"), roughness: 2.0, metallic: 0.0 });
    this.ground.transform = Mat4.translation( 0, -3, 0 );

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