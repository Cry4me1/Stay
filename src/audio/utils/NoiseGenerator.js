/**
 * NoiseGenerator - 噪声生成工具类
 * 使用 AudioWorklet 生成三种类型的噪声
 */

/**
 * 创建白噪音生成器
 * @param {AudioContext} context 
 * @returns {AudioBufferSourceNode}
 */
export function createWhiteNoise(context) {
  const bufferSize = context.sampleRate * 2; // 2秒缓冲
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const data = buffer.getChannelData(0);
  
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  
  return source;
}

/**
 * 创建粉红噪音生成器
 * 使用 Voss-McCartney 算法近似
 * @param {AudioContext} context 
 * @returns {AudioBufferSourceNode}
 */
export function createPinkNoise(context) {
  const bufferSize = context.sampleRate * 2;
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const data = buffer.getChannelData(0);
  
  // Voss-McCartney 算法参数
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    
    // 归一化到 -1 到 1 范围
    data[i] = pink * 0.11;
  }
  
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  
  return source;
}

/**
 * 创建布朗噪音生成器
 * 通过积分白噪音实现
 * @param {AudioContext} context 
 * @returns {AudioBufferSourceNode}
 */
export function createBrownNoise(context) {
  const bufferSize = context.sampleRate * 2;
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const data = buffer.getChannelData(0);
  
  let lastOut = 0;
  
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    
    // 积分（累加）白噪音，系数控制衰减速度
    lastOut = (lastOut + (0.02 * white)) / 1.02;
    
    // 归一化
    data[i] = lastOut * 3.5;
  }
  
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  
  return source;
}

/**
 * NoiseGenerator 类 - 统一的噪声生成接口
 */
export class NoiseGenerator {
  /**
   * @param {AudioContext} context 
   * @param {'white' | 'pink' | 'brown'} type 
   */
  constructor(context, type = 'white') {
    this.context = context;
    this.type = type;
    this.source = null;
    this.output = context.createGain();
  }

  /**
   * 启动噪声生成
   */
  start() {
    if (this.source) {
      this.stop();
    }
    
    switch (this.type) {
      case 'pink':
        this.source = createPinkNoise(this.context);
        break;
      case 'brown':
        this.source = createBrownNoise(this.context);
        break;
      default:
        this.source = createWhiteNoise(this.context);
    }
    
    this.source.connect(this.output);
    this.source.start();
  }

  /**
   * 停止噪声生成
   */
  stop() {
    if (this.source) {
      try {
        this.source.stop();
        this.source.disconnect();
      } catch (e) {
        // 忽略已停止的源
      }
      this.source = null;
    }
  }

  /**
   * 连接到目标节点
   * @param {AudioNode} destination 
   */
  connect(destination) {
    this.output.connect(destination);
  }

  /**
   * 断开所有连接
   */
  disconnect() {
    this.output.disconnect();
  }

  /**
   * 释放资源
   */
  dispose() {
    this.stop();
    this.disconnect();
  }
}
