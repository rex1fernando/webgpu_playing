async function start() {
  const BUFFER_SIZE = 134217728;

  var navigator = window.navigator;


  if (!navigator.gpu) throw Error("WebGPU not supported.");

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw Error("Couldn’t request WebGPU adapter.");

  device = await adapter.requestDevice();
  if (!device) throw Error("Couldn’t request WebGPU logical device.");

  const module = device.createShaderModule({
    code: `
    struct Ball {
      radius: f32,
      position: vec2<f32>,
      velocity: vec2<f32>,
    }
    @group(0) @binding(0)
    var<storage, read> input: array<Ball>;

    @group(0) @binding(1)
    var<storage, read_write> output: array<Ball>;

    const TIME_STEP: f32 = 0.016;

    @compute @workgroup_size(64)
    fn main(

      @builtin(global_invocation_id)
      global_id : vec3<u32>,

      @builtin(local_invocation_id)
      local_id : vec3<u32>,

    ) {

      let num_balls = arrayLength(&output);
      if(global_id.x >= num_balls) {
        return;
      }
      output[global_id.x].position =
        input[global_id.x].position +
        input[global_id.x].velocity * TIME_STEP;
    }

  `,
  });

  let inputBalls = new Float32Array(new ArrayBuffer(BUFFER_SIZE));
  for (let i = 0; i < NUM_BALLS; i++) {
    inputBalls[i * 6 + 0] = randomBetween(2, 10); // radius
    inputBalls[i * 6 + 1] = 0; // padding
    inputBalls[i * 6 + 2] = randomBetween(0, ctx.canvas.width); // position.x
    inputBalls[i * 6 + 3] = randomBetween(0, ctx.canvas.height); // position.y
    inputBalls[i * 6 + 4] = randomBetween(-100, 100); // velocity.x
    inputBalls[i * 6 + 5] = randomBetween(-100, 100); // velocity.y
  }


  const bindGroupLayout =
    device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "read-only-storage",
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "storage",
          },
        }],
    });



  const input = device.createBuffer({
    size: BUFFER_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });


  const output = device.createBuffer({
    size: BUFFER_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  });

  const stagingBuffer = device.createBuffer({
    size: BUFFER_SIZE,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: input,
        },
      },
      {
      binding: 1,
      resource: {
        buffer: output,
      },
    }],
  });


  const pipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module,
      entryPoint: "main",
    },
  });

  device.queue.writeBuffer(input, 0, inputBalls);

  const commandEncoder = device.createCommandEncoder();
  const passEncoder = commandEncoder.beginComputePass();
  passEncoder.setPipeline(pipeline);

  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.dispatchWorkgroups(Math.ceil(BUFFER_SIZE / 64));

  passEncoder.end();

  commandEncoder.copyBufferToBuffer(
    output,
    0, // Source offset
    stagingBuffer,
    0, // Destination offset
    BUFFER_SIZE
  );

  const commands = commandEncoder.finish();
  device.queue.submit([commands]);



  await stagingBuffer.mapAsync(
    GPUMapMode.READ,
    0, // Offset
    BUFFER_SIZE // Length
  );
  const copyArrayBuffer =
    stagingBuffer.getMappedRange(0, BUFFER_SIZE);
  const data = copyArrayBuffer.slice();
  stagingBuffer.unmap();
  console.log(new Float32Array(data));
}

start();
