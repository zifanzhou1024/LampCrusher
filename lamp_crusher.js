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
    this.lamp.material      = new Material(new PBRMaterial(), { diffuse: hex_color("#ffffff"), roughness: 0.1, metallic: 0.5 });

    this.ground             = new Actor();
    this.ground.mesh        = new Ground();
    this.ground.material    = new Material(new PBRMaterial(), { diffuse: color( 0.403, 0.538, 1.768, 1.0 ), roughness: 1.0, metallic: 0.1 });
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

    // Add a state variable to toggle the camera view
    this.third_person_view = false;
    this.intro_view = false;
    this.always_jumping = false;

    // Initialize the default camera position
    this.initial_camera_location = Mat4.translation(5, -10, -30);

    // Initialize lamp movement variables
    this.lamp_jump_velocity = 0;
    this.lamp_is_jumping = false;
    this.lamp_y_position = 0;
    this.gravity = -0.1;
    this.jump_strength = 1.0;
    // this.original_lamp_y = 0; // Store the original y position of the lamp - starting ground level of the lamp
    // Store the original y position of the lamp dynamically
    this.original_lamp_y = this.lamp.transform[1][3];

    // Initialize lamp movement direction
    this.lamp_direction = vec3(0, 0, -1); // Forward direction
    this.lamp_speed = 2; // Movement speed

    // Key states for movement
    this.key_states = {};
  }

  make_control_panel()
  {
    this.key_triggered_button("Toggle Third Person View", ["t"], () => {
      this.third_person_view = !this.third_person_view;
      this.key_states = {}; // Reset key states when switching view mode
    });

    this.key_triggered_button("Toggle Intro View", ["i"], () => {
      this.intro_view = !this.intro_view;
    });

    // Maybe deprecated?
    this.key_triggered_button("Lamp Jump", ["j"], () => {
      if (!this.lamp_is_jumping) {
        this.lamp_jump_velocity = this.jump_strength; // Initial jump velocity
        this.lamp_is_jumping = true;
      }
    });
    this.key_triggered_button("Always Jump", ["k"], () => {
      this.always_jumping = !this.always_jumping;
      if (this.always_jumping && !this.lamp_is_jumping) {
        this.lamp_jump_velocity = this.jump_strength; // Initial jump velocity
        this.lamp_is_jumping = true;
      }
    });
    document.addEventListener("keydown", (e) => {
      if (this.third_person_view) {
        this.key_states[e.key] = true;
      }
    });

    document.addEventListener("keyup", (e) => {
      if (this.third_person_view) {
        this.key_states[e.key] = false;
      }
    });

  }

  update_lamp_movement(dt) {
    // Handle jumping
    if (this.lamp_is_jumping) {
      this.lamp_jump_velocity += this.gravity * dt;
      this.lamp_y_position += this.lamp_jump_velocity * dt;
      // let new_lamp_y_position = this.lamp_y_position + this.lamp_jump_velocity * dt;

      if (this.lamp_y_position <= this.original_lamp_y) { // Check if the lamp is on the ground
        this.lamp_y_position = this.original_lamp_y; // Reset to ground level
        // new_lamp_y_position = this.original_lamp_y; // Reset to ground level
        this.lamp_is_jumping = false;
        this.lamp_jump_velocity = 0;

        if (this.always_jumping) {
          this.lamp_jump_velocity = this.jump_strength; // Initial jump velocity
          this.lamp_is_jumping = true;
        }
      }

      // Update the lamp's transform based on its current position and new y position
      let lamp_translation = this.lamp.transform[0][3];
      let lamp_depth = this.lamp.transform[2][3];
      this.lamp.transform = Mat4.translation(lamp_translation, this.lamp_y_position, lamp_depth);


    }

    // Handle movement
    if (this.third_person_view) {
      let movement_transform = Mat4.identity();

      if (this.key_states["w"]) {
        movement_transform = movement_transform.times(Mat4.translation(0, 0, -this.lamp_speed * dt));
      }
      if (this.key_states["s"]) {
        movement_transform = movement_transform.times(Mat4.translation(0, 0, this.lamp_speed * dt));
      }
      if (this.key_states["a"]) {
        movement_transform = movement_transform.times(Mat4.translation(-this.lamp_speed * dt, 0, 0));
      }
      if (this.key_states["d"]) {
        movement_transform = movement_transform.times(Mat4.translation(this.lamp_speed * dt, 0, 0));
      }
      if (this.key_states[" "]) {
        if (!this.lamp_is_jumping) {
          this.lamp_jump_velocity = this.jump_strength; // Initial jump velocity
          this.lamp_is_jumping = true;
        }
      }

      this.lamp.transform = movement_transform.times(this.lamp.transform);


      // this.original_lamp_y = this.lamp.transform[1][3]; // Add this line if want the lamp to jump infinitely high
    }

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
    program_state.directional_light = new DirectionalLight( vec3( -1, -1, 1 ), vec3( 1, 1, 1 ), 7 );

    /*
      TODO: GAME LOGIC GOES HERE
    */

    // Update lamp movement
    let dt = program_state.animation_delta_time / 1000; // Delta time in seconds
    dt *= 20; // Speed up the animation
    this.update_lamp_movement(dt);

    // Store the initial camera location for manual controls
    let camera_transform = program_state.camera_inverse;

    // Update camera based on the view mode - third person view of the lamp
    if (this.third_person_view) {
      const lamp_position = this.lamp.transform.times(vec4(0, 0, 0, 1)).to3();
      // const camera_offset = vec3(40, 0, 0);  // Adjust this offset to get the desired third-person view
      const camera_offset = vec3(10, 5, 10);  // Adjust this offset to get the desired third-person view
      const camera_position = lamp_position.plus(camera_offset);
      const target_position = lamp_position;
      const up_vector = vec3(0, 1, 0);  // Assuming the up direction is the positive Y-axis
      const camera_transform = Mat4.look_at(camera_position, target_position, up_vector);

      program_state.set_camera(camera_transform);
    } else if(this.intro_view){
      const camera_position = vec3(40, 0,0);
      const target_position = this.letter_x.transform.times(vec4(0, 0, 0, 1)).to3();
      const up_vector = vec3(0, 1, 0);  // Assuming the up direction is the positive Y-axis
      const camera_transform = Mat4.look_at(camera_position, target_position, up_vector);

      program_state.set_camera(camera_transform);
    }
    else {
      program_state.set_camera(camera_transform);

    }

    this.renderer.submit( context, program_state, this.actors )
  }
}