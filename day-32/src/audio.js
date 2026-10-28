let audioContext = null;
let analyser = null;
let dataArray = null;
let gainNode = null;
let isPlaying = false;

export function initAudioSystem() {
  const playBtn = document.getElementById("playBtn");
  const gainSlider = document.getElementById("gainSlider");
  const smoothSlider = document.getElementById("smoothSlider");

  function setupAudio() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;

    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    gainNode = audioContext.createGain();
    gainNode.gain.value = parseFloat(gainSlider.value);

    // Tạo các oscillator (Bass, Mid, Treble)
    const bass = audioContext.createOscillator();
    bass.type = "sine";
    bass.frequency.value = 60;

    const mid = audioContext.createOscillator();
    mid.type = "square";
    mid.frequency.value = 400;

    const treble = audioContext.createOscillator();
    treble.type = "sawtooth";
    treble.frequency.value = 2000;

    // LFO (Low Frequency Oscillator) điều biến tần số tự động
    const lfo = audioContext.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.3;
    const lfoGain = audioContext.createGain();
    lfoGain.gain.value = 30;

    lfo.connect(lfoGain);
    lfoGain.connect(bass.frequency);
    lfoGain.connect(mid.frequency);

    // Gain riêng cho từng dải sóng
    const bassGain = audioContext.createGain();
    bassGain.gain.value = 0.4;
    const midGain = audioContext.createGain();
    midGain.gain.value = 0.3;
    const trebleGain = audioContext.createGain();
    trebleGain.gain.value = 0.2;

    bass.connect(bassGain);
    mid.connect(midGain);
    treble.connect(trebleGain);

    bassGain.connect(gainNode);
    midGain.connect(gainNode);
    trebleGain.connect(gainNode);

    gainNode.connect(analyser);
    analyser.connect(audioContext.destination);

    bass.start();
    mid.start();
    treble.start();
    lfo.start();
  }

  playBtn.addEventListener("click", () => {
    if (!audioContext) {
      setupAudio();
      isPlaying = true;
      playBtn.textContent = "PAUSE";
      playBtn.classList.add("active");
    } else if (audioContext.state === "suspended") {
      audioContext.resume();
      isPlaying = true;
      playBtn.textContent = "PAUSE";
      playBtn.classList.add("active");
    } else {
      audioContext.suspend();
      isPlaying = false;
      playBtn.textContent = "PLAY";
      playBtn.classList.remove("active");
    }
  });

  gainSlider.addEventListener("input", (e) => {
    if (gainNode) {
      gainNode.gain.value = parseFloat(e.target.value);
    }
  });

  smoothSlider.addEventListener("input", (e) => {
    if (analyser) {
      analyser.smoothingTimeConstant = parseFloat(e.target.value);
    }
  });
}

export function getAudioData() {
  if (!analyser || !isPlaying) {
    return { bass: 0, mid: 0, treble: 0, overall: 0 };
  }

  analyser.getByteFrequencyData(dataArray);

  const bassRange = dataArray.slice(0, 10);
  const midRange = dataArray.slice(10, 50);
  const trebleRange = dataArray.slice(50, 128);

  const bass = bassRange.reduce((a, b) => a + b, 0) / bassRange.length / 255;
  const mid = midRange.reduce((a, b) => a + b, 0) / midRange.length / 255;
  const treble =
    trebleRange.reduce((a, b) => a + b, 0) / trebleRange.length / 255;
  const overall = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;

  return { bass, mid, treble, overall };
}
