// Lamp source
// https://www.cgtrader.com/free-3d-models/furniture/lamp/pixar-lamp-518a1299-ae8f-4847-ba1a-110d4f68d172
import { defs, tiny } from './examples/common.js';

import { Renderer, DirectionalLight, SpotLight, Mesh, Ground, PBRMaterial, RenderBuffers } from './renderer.js'

const {
  Vector, Vector3, vec, vec3, vec4, color, hex_color, Matrix, Mat4, Light, Shape, Material, Scene, Shader,
} = tiny;

export class Actor {
  constructor() {
    this.transform = Mat4.identity();
    this.mesh = null;
    this.material = null;
    this.bounding_box = null; // Optional bounding box for collision detection
    this.active = true; // Set to false to remove the actor from the scene
  }
}

export class LampCrusher extends Scene {
  constructor() {
    super();
    // this.context = context;
    // this.canvas = context.canvas;

    this.materials = {
      plastic: new Material(new defs.Phong_Shader(),
        { ambient: .4, diffusivity: .6, color: hex_color("#ffffff") }),
      pbr: new Material(new PBRMaterial(),
        { diffuse: hex_color("#ffffff") }),
    };

    this.renderer = null;
    this.camera_distance = 10;

    this.lamp = new Actor();
    this.lamp.mesh = new Mesh("./assets/lamp.obj");
    this.lamp.material = new Material(new PBRMaterial(), { diffuse: hex_color("#ffffff"), roughness: 0.1, metallic: 0.5 });
    this.lamp.mesh.bounding_box = vec3(1, 1, 1); // Set an appropriate bounding box for the lamp

    this.ground = new Actor();
    this.ground.mesh = new Ground();
    this.ground.material = new Material(new PBRMaterial(), { diffuse: color(0.403, 0.538, 1.768, 1.0), roughness: 1.0, metallic: 0.1 });
    this.ground.transform = Mat4.translation(0, -2.5, 0);
    this.ground.mesh.bounding_box = vec3(10, 0.1, 10); // Set an appropriate bounding box for the ground

    this.letter_p = new Actor();
    this.letter_p.mesh = new Mesh("./assets/pixar_p.obj");
    this.letter_p.material = new Material(new PBRMaterial(), { diffuse: hex_color("#000000"), roughness: 1.0, metallic: 0.1 });
    this.letter_p.transform = Mat4.translation(-10, -1, 30);
    this.letter_p.mesh.bounding_box = vec3(1, 1, 1); // Set an appropriate bounding box for the letter P

    this.letter_i = new Actor();
    this.letter_i.mesh = new Mesh("./assets/pixar_i.obj");
    this.letter_i.material = new Material(new PBRMaterial(), { diffuse: hex_color("#000000"), roughness: 1.0, metallic: 0.1 });
    this.letter_i.transform = Mat4.translation(-10, -1.5, 15); // idk wtf happened with the import honestly
    this.letter_i.mesh.bounding_box = vec3(1, 1, 1); // Set an appropriate bounding box for the letter I

    this.letter_x = new Actor();
    this.letter_x.mesh = new Mesh("./assets/pixar_x.obj");
    this.letter_x.material = new Material(new PBRMaterial(), { diffuse: hex_color("#000000"), roughness: 1.0, metallic: 0.1 });
    this.letter_x.transform = Mat4.translation(-10, -1, 0);
    this.letter_x.mesh.bounding_box = vec3(1, 1, 1); // Set an appropriate bounding box for the letter X

    this.letter_a = new Actor();
    this.letter_a.mesh = new Mesh("./assets/pixar_a.obj");
    this.letter_a.material = new Material(new PBRMaterial(), { diffuse: hex_color("#000000"), roughness: 1.0, metallic: 0.1 });
    this.letter_a.transform = Mat4.translation(-10, -1, -15);
    this.letter_a.mesh.bounding_box = vec3(1, 1, 1); // Set an appropriate bounding box for the letter A

    this.letter_r = new Actor();
    this.letter_r.mesh = new Mesh("./assets/pixar_r.obj");
    this.letter_r.material = new Material(new PBRMaterial(), { diffuse: hex_color("#000000"), roughness: 1.0, metallic: 0.1 });
    this.letter_r.transform = Mat4.translation(-10, -1, -30);
    this.letter_r.mesh.bounding_box = vec3(1, 1, 1); // Set an appropriate bounding box for the letter R

    this.actors = [this.lamp, this.ground, this.letter_p, this.letter_i, this.letter_x, this.letter_a, this.letter_r];

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
    // mouse stuff
    this.camera_rotation_x = 0;
    this.camera_rotation_y = 0;

    // Initialize score
    this.score = 0;
    // Create a HTML element for displaying the score
    const scoreElement = document.createElement('div');
    scoreElement.id = 'score';
    scoreElement.style.position = 'absolute';
    scoreElement.style.top = '10px';
    scoreElement.style.left = '50%';
    scoreElement.style.transform = 'translateX(-50%)';
    scoreElement.style.color = 'red';
    scoreElement.style.fontSize = '20px';
    scoreElement.style.fontFamily = 'Arial, sans-serif';
    scoreElement.textContent = `Score: ${this.score}`;
    document.body.appendChild(scoreElement);
  }

  make_control_panel() {
    document.addEventListener("mousemove", this.handle_mouse_move.bind(this));
    document.addEventListener("click", this.request_pointer_lock.bind(this));
    document.addEventListener("pointerlockchange", this.handle_pointer_lock_change.bind(this));
    document.addEventListener("mozpointerlockchange", this.handle_pointer_lock_change.bind(this));
    document.addEventListener("wheel", this.handle_mouse_wheel.bind(this));
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
    this.new_line();
    this.new_line();

    this.key_triggered_button("Cycle Render Buffers", ["`"], () => {
      if (this.renderer)
      {
        this.renderer.cycle_blit_buffer();
      }
    });

    this.key_triggered_button("Toggle Temporal Anti-Aliasing", ["["], () => {
      if (this.renderer)
      {
        this.renderer.enable_taa = !this.renderer.enable_taa;
      }
    });

    this.key_triggered_button("Toggle PCF Shadows", ["]"], () => {
      if (this.renderer)
      {
        this.renderer.enable_pcf = !this.renderer.enable_pcf;
      }
    });
  }
  handle_mouse_wheel(e) {
    if (this.third_person_view) {
      const delta = e.deltaY < 0 ? -1 : 1;
      const zoom_speed = 0.1;
      const min_distance = 5;
      const max_distance = 20;
  
      this.camera_distance -= delta * zoom_speed;
      this.camera_distance = Math.max(Math.min(this.camera_distance, max_distance), min_distance);
    }
  }
  handle_mouse_move(e) {
    if (this.third_person_view&& document.pointerLockElement === this.canvas) {
      const dx = e.movementX;
      const dy = e.movementY;
      const sensitivity = 0.002;

      // Update the camera's rotation based on the mouse movement
      this.camera_rotation_x += dy * sensitivity;
      this.camera_rotation_y -= dx * sensitivity;

      // Clamp the vertical rotation to avoid flipping the camera
      this.camera_rotation_x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.camera_rotation_x));
    }
  }

  handle_pointer_lock_change() {
    // const canvas = document.querySelector("canvas");
    if (this.canvas && (document.pointerLockElement === this.canvas || document.mozPointerLockElement === this.canvas)) {
      console.log("Pointer locked");
      document.addEventListener("mousemove", this.handle_mouse_move.bind(this));
      document.addEventListener("wheel", this.handle_mouse_wheel.bind(this), { passive: false });
      document.addEventListener("wheel", this.prevent_default_behavior, { passive: false });
    } else {
      console.log("Pointer unlocked");
      document.removeEventListener("mousemove", this.handle_mouse_move);
      document.removeEventListener("wheel", this.handle_mouse_wheel);
      document.removeEventListener("wheel", this.prevent_default_behavior);
    }
  }

  prevent_default_behavior(e) {
    e.preventDefault();
  }

  // Function to get the Oriented Bounding Box (OBB) of an actor
  getOBB(actor) {
    const transform = actor.transform;
    const position = vec3(transform[0][3], transform[1][3], transform[2][3]);
    const orientation = [
      vec3(transform[0][0], transform[1][0], transform[2][0]),
      vec3(transform[0][1], transform[1][1], transform[2][1]),
      vec3(transform[0][2], transform[1][2], transform[2][2])
    ];
    const size = actor.mesh.bounding_box || vec3(1, 1, 1); // Ensure size is defined
    return { position, orientation, size };
  }

  // Function to check if two OBBs are colliding
  areOBBsColliding(obb1, obb2) {
    const getSeparatingAxes = (obb1, obb2) => {
      const axes = [
        obb1.orientation[0],
        obb1.orientation[1],
        obb1.orientation[2],
        obb2.orientation[0],
        obb2.orientation[1],
        obb2.orientation[2],
      ];

      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          axes.push(obb1.orientation[i].cross(obb2.orientation[j]).normalized());
        }
      }

      return axes;
    }

    const axes = getSeparatingAxes(obb1, obb2);

    for (let axis of axes) {
      if (!this.overlapOnAxis(obb1, obb2, axis)) {
        return false;
      }
    }

    return true;
  }

  // Function to check if two OBBs overlap on a given axis
  overlapOnAxis(obb1, obb2, axis) {
    const project = (obb, axis) => {
      const corners = this.getCorners(obb);
      let min = corners[0].dot(axis);
      let max = min;
      for (let i = 1; i < corners.length; i++) {
        const projection = corners[i].dot(axis);
        if (projection < min) {
          min = projection;
        }
        if (projection > max) {
          max = projection;
        }
      }
      return [min, max];
    }

    const [min1, max1] = project(obb1, axis);
    const [min2, max2] = project(obb2, axis);

    return !(min1 > max2 || min2 > max1);
  }

  // Function to get the corners of an OBB
  getCorners(obb) {
    const corners = [];
    const { position, orientation, size } = obb;
    const directions = [
      vec3(-1, -1, -1), vec3(-1, -1, 1), vec3(-1, 1, -1), vec3(-1, 1, 1),
      vec3(1, -1, -1), vec3(1, -1, 1), vec3(1, 1, -1), vec3(1, 1, 1),
    ];

    for (let direction of directions) {
      let corner = position.copy();
      for (let i = 0; i < 3; i++) {
        corner = corner.plus(orientation[i].times(direction[i] * size[i]));
      }
      corners.push(corner);
    }

    return corners;
  }


  update_lamp_movement(dt) {
    // Handle jumping
    if (this.lamp_is_jumping) {
      this.lamp_jump_velocity += this.gravity * dt;
      this.lamp_y_position += this.lamp_jump_velocity * dt;

      if (this.lamp_y_position <= this.original_lamp_y) {
        this.lamp_y_position = this.original_lamp_y;
        this.lamp_is_jumping = false;
        this.lamp_jump_velocity = 0;

        if (this.always_jumping) {
          this.lamp_jump_velocity = this.jump_strength;
          this.lamp_is_jumping = true;
        }
      }

      // Apply the rotation even when jumping
      const current_rotation = Math.atan2(this.lamp.transform[0][2], this.lamp.transform[2][2]);
      const lamp_rotation = Mat4.identity().times(Mat4.rotation(current_rotation, 0, 1, 0));
      this.lamp.transform = Mat4.translation(this.lamp.transform[0][3], this.lamp_y_position, this.lamp.transform[2][3]).times(lamp_rotation);
    }

    // Handle movement
    if (this.third_person_view) {
      const movement_speed = this.lamp_speed * dt;
      const forward = vec3(
        Math.sin(this.camera_rotation_y),
        0,
        Math.cos(this.camera_rotation_y)
      ).normalized();
      const right = vec3(
        Math.cos(this.camera_rotation_y),
        0,
        -Math.sin(this.camera_rotation_y)
      ).normalized();

      // console.log(forward);
      // console.log(right);



      let movement_direction = vec3(0, 0, 0);

      if (this.key_states["w"]) {
        movement_direction = movement_direction.minus(forward);
      }
      if (this.key_states["s"]) {
        movement_direction = movement_direction.plus(forward);
      }
      if (this.key_states["a"]) {
        movement_direction = movement_direction.minus(right);
      }
      if (this.key_states["d"]) {
        movement_direction = movement_direction.plus(right);
      }



      let mvmt_trans = Mat4.identity();
      if (movement_direction.norm() !== 0) {
        movement_direction = movement_direction.normalized().times(movement_speed);
        mvmt_trans = mvmt_trans.times(Mat4.translation(movement_direction[0], movement_direction[1], movement_direction[2]));

        // Calculate the rotation angle based on the movement direction
        const target_rotation = Math.atan2(movement_direction[0], movement_direction[2]);

        // Calculate the rotation step based on the desired speed
        const rotation_speed = 0.8; // Adjust this value to control the rotation speed
        const rotation_step = rotation_speed * dt;

        // Interpolate the current rotation angle towards the target rotation angle
        const current_rotation = Math.atan2(this.lamp.transform[0][2], this.lamp.transform[2][2]);
        let rotation_diff = target_rotation - current_rotation;

        // Ensure the rotation difference is in the range [-π, π]
        if (rotation_diff > Math.PI) {
          rotation_diff -= 2 * Math.PI;
        } else if (rotation_diff < -Math.PI) {
          rotation_diff += 2 * Math.PI;
        }

        const new_rotation = current_rotation + Math.sign(rotation_diff) * Math.min(Math.abs(rotation_diff), rotation_step);

        // Create a rotation matrix using Mat4.rotation()
        const lamp_rotation = Mat4.identity().times(Mat4.rotation(new_rotation, 0, 1, 0));
        this.lamp.transform = this.lamp.transform.times(Mat4.inverse(Mat4.rotation(current_rotation, 0, 1, 0))).times(lamp_rotation);
      }

      if (this.key_states[" "]) {
        if (!this.lamp_is_jumping) {
          this.lamp_jump_velocity = this.jump_strength; // Initial jump velocity
          this.lamp_is_jumping = true;
        }
      }

      this.lamp.transform = mvmt_trans.times(this.lamp.transform);
      // this.original_lamp_y = this.lamp.transform[1][3]; // Add this line if want the lamp to jump infinitely high

      // this.check_collisions()
      // Collision detection
      const lampOBB = this.getOBB(this.lamp);
      for (let i = this.actors.length - 1; i >= 0; i--) {
        const actor = this.actors[i];
        if (actor !== this.lamp) {
          const actorOBB = this.getOBB(actor);
          if (this.areOBBsColliding(lampOBB, actorOBB)) {
            console.log("Collision detected with", actor);
            this.actors.splice(i, 1); // Remove the actor from the array

            // Update score
            this.score += 50;
            this.updateScoreDisplay();
          }
        }
      }
    }

  }
  updateScoreDisplay() {
    const scoreElement = document.getElementById('score');
    if (scoreElement) {
      scoreElement.textContent = `Score: ${this.score}`;
    }
  }
  request_pointer_lock() {
    
    this.canvas.requestPointerLock();
  }

  display(context, program_state) {
    if (!this.renderer) {
      const gl = context.context;
      this.renderer = new Renderer(gl);
    }
    this.canvas = context.canvas
    if (!context.scratchpad.controls) {
      this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
      // Define the global camera and projection matrices, which are stored in program_state.
      program_state.set_camera(Mat4.translation(5, -10, -30));
    }

    program_state.projection_transform = Mat4.perspective(
      Math.PI / 4, context.width / context.height, 1, 100);

    // *** Lights: *** Values of vector or point lights.
    program_state.directional_light = new DirectionalLight(vec3(-1, -1, 1), vec3(1, 1, 1), 7);

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
    const ground_level = -2.5; // Adjust this value to match the ground level in your scene
    const max_pitch = Math.PI / 2 - 0.1; // Adjust this value to set the maximum pitch angle

    // Limit the camera's vertical rotation (pitch) to prevent looking exactly up
    this.camera_rotation_x = Math.min(Math.max(this.camera_rotation_x, -max_pitch), max_pitch);

    // Calculate the camera position based on the rotation and camera distance
    let camera_position = lamp_position.plus(
      vec3(
        this.camera_distance * Math.sin(this.camera_rotation_y) * Math.cos(this.camera_rotation_x),
        this.camera_distance * Math.sin(this.camera_rotation_x),
        this.camera_distance * Math.cos(this.camera_rotation_y) * Math.cos(this.camera_rotation_x)
      )
    );
  
      // Ensure the camera's y-position is above the ground level
      camera_position[1] = Math.max(camera_position[1], ground_level);
  
      const target_position = lamp_position;
      const up_vector = vec3(0, 1, 0);
  
      // Check if the camera position and target position are too close
      const distance = camera_position.minus(target_position).norm();
      if (distance < 0.1) {
        // Adjust the camera position slightly to avoid parallel vectors
        const offset = camera_position.minus(target_position).normalized().times(0.1);
        camera_position.add_by(offset);
      }
  
      const camera_transform = Mat4.look_at(camera_position, target_position, up_vector);
  
      program_state.set_camera(camera_transform);
    } else if (this.intro_view) {
      const camera_position = vec3(40, 0, 0);
      const target_position = this.letter_x.transform.times(vec4(0, 0, 0, 1)).to3();
      const up_vector = vec3(0, 1, 0);  // Assuming the up direction is the positive Y-axis
      const camera_transform = Mat4.look_at(camera_position, target_position, up_vector);

      program_state.set_camera(camera_transform);
    }
    else {
      program_state.set_camera(camera_transform);

    }

    program_state.spot_light = new SpotLight(
      this.lamp.transform.times(vec4(0, 1, 0.5, 1)).to3(),
      this.lamp.transform.times(vec4(0, -0.5, 1, 0)).to3(),
      vec3(1, 1, 1),
      10,
      Math.PI / 9,
      Math.PI / 6
    );

    this.renderer.submit(context, program_state, this.actors)
  }
}
