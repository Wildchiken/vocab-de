// Safari 自带德语语音。iOS 设置 > 辅助功能 > 朗读内容 > 声音 里可以下载更自然的"增强/高级"版本
let voice = null;

function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('de'));
  voice =
    vs.find((v) => /premium|enhanced|erweitert|高级|增强/i.test(v.name)) ||
    vs.find((v) => v.lang.toLowerCase() === 'de-de' && /anna|helena|petra|markus|yannick/i.test(v.name)) ||
    vs.find((v) => v.lang.toLowerCase() === 'de-de') ||
    vs[0] ||
    null;
}

if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

export const ttsAvailable = () => 'speechSynthesis' in window;

export function speak(text) {
  if (!ttsAvailable() || !text) return;
  if (!voice) pickVoice();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  if (voice) u.voice = voice;
  u.rate = 0.92;
  speechSynthesis.speak(u);
}
