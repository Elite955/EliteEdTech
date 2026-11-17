const PROFANITY = [
  'arse', 'ass', 'asshole', 'bastard', 'bitch', 'bollocks', 'bugger', 'bullshit',
  'cock', 'cunt', 'damn', 'dick', 'dumbass', 'fag', 'fart', 'fuck', 'goddamn',
  'hell', 'hoe', 'jackass', 'jerk', 'nigga', 'nigger', 'piss', 'prick', 'pussy',
  'retard', 'shit', 'slut', 'twat', 'wanker', 'whore',
];

const ESCAPED = PROFANITY.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const PATTERN = new RegExp(`\\b(${ESCAPED.join('|')})\\b`, 'gi');

export function hasProfanity(text) {
  return PATTERN.test(text);
}

export function censorContent(text) {
  return text.replace(PATTERN, (match) => `${match[0]}${'*'.repeat(Math.max(match.length - 2, 1))}${match[match.length - 1]}`);
}
