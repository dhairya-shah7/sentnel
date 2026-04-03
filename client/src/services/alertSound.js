let audioContext = null;
let unlocked = false;

const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!audioContext) {
    audioContext = new AudioContextCtor();
  }
  return audioContext;
};

export const unlockAlertSound = async () => {
  const ctx = getAudioContext();
  if (!ctx || unlocked) return;
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    unlocked = true;
  } catch {
    // Silent fail: browsers can block audio until a user gesture occurs.
  }
};

export const playCriticalAlertSound = async () => {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    unlocked = true;

    const now = ctx.currentTime;
    const createTone = (startAt, frequency) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(frequency, startAt);

      gainNode.gain.setValueAtTime(0.0001, startAt);
      gainNode.gain.exponentialRampToValueAtTime(0.16, startAt + 0.015);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(startAt);
      oscillator.stop(startAt + 0.2);
    };

    createTone(now, 880);
    createTone(now + 0.22, 660);
  } catch {
    // Ignore audio failures; alert banners still show visually.
  }
};
