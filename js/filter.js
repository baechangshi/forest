// 메시지 기본 필터 — 욕설·연락처·링크 차단 (완벽하지 않으니 README의 관리 방법 참고)
const BANNED = [
  '시발', '씨발', '씨빨', '씹', 'ㅅㅂ', 'ㅆㅂ', 'ㅂㅅ', '병신', '븅신', '개새', '좆', '존나', '졸라', '지랄', 'ㅈㄹ',
  '미친놈', '미친년', '닥쳐', '꺼져', '니애미', '느금', '애미', '애비', '엠창', '창녀', '걸레', '보지', '자지', '섹스', '야동', '한남', '김치녀', '틀딱', '자살',
  'fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fag', 'dick', 'pussy', 'porn', 'whore', 'slut', 'rape', 'kill yourself', 'kys',
];
export function checkMessage(raw) {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length < 1) return { ok: false, why: '내용을 적어 주세요.' };
  if (text.length > 40) return { ok: false, why: '40자 이내로 적어 주세요.' };
  const flat = text.toLowerCase().replace(/[\s\d!@#$%^&*()_+\-=.,~`'"?/\\|<>[\]{}:;·•ㆍ]/g, '');
  if (BANNED.some((w) => flat.includes(w.replace(/\s/g, '')))) return { ok: false, why: '숲에 어울리지 않는 말이 있어요.' };
  if (/(https?:|www\.|\.com|\.kr|\.net|\.io|@)/i.test(text)) return { ok: false, why: '링크나 주소는 남길 수 없어요.' };
  if (/\d{3,4}[\s.-]?\d{3,4}[\s.-]?\d{4}/.test(text) || /\d{6,}/.test(text)) return { ok: false, why: '전화번호·숫자열은 남길 수 없어요.' };
  return { ok: true, text };
}
