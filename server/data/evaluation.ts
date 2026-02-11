import inflection from 'inflection';

/**
 * Normalize text for comparison
 * - Trim whitespace
 * - Convert to lowercase
 * - Normalize apostrophes
 * - Remove multiple spaces
 */
function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/'/g, "'")
    .replace(/\s+/g, ' ');
}

/**
 * Check if two answers match, including singular/plural variations
 */
function doublecheckPlural(referenceAnswers: string[], answer1: string): boolean {
  for (const ref of referenceAnswers) {
    if (!ref) continue;

    let ans1 = normalize(answer1);
    let ans2 = normalize(ref);

    // Remove trailing " )"
    if (ans1.endsWith(' )')) {
      ans1 = ans1.slice(0, -2);
    }
    if (ans2.endsWith(' )')) {
      ans2 = ans2.slice(0, -2);
    }

    // Direct match
    if (ans1 === ans2) {
      return true;
    }

    // Check if answer has parenthetical that matches
    if (ans1.includes('(')) {
      const beforeParen = ans1.split('(')[0].trim();
      if (beforeParen === ans2) {
        return true;
      }
    }

    // Check for "The answer is: X" format
    if (ans1.includes('the answer is: ')) {
      const afterPrefix = ans1.split('the answer is: ')[1]?.trim();
      if (afterPrefix === ans2) {
        return true;
      }
    }

    // Check singular/plural variations
    try {
      const singularAns1 = inflection.singularize(ans1);
      const singularAns2 = inflection.singularize(ans2);

      if (singularAns1 === ans2 || singularAns2 === ans1) {
        return true;
      }
      if (singularAns1 === singularAns2) {
        return true;
      }
    } catch {
      // inflection might fail on some words, that's OK
    }
  }

  return false;
}

/**
 * Evaluate if a guess matches reference answers
 *
 * @param guess - The guessed answer
 * @param referenceAnswers - List of acceptable answers
 * @param referenceIncorrect - List of explicitly incorrect answers (optional)
 * @returns true if the guess is correct
 */
export function evaluateAnswer(
  guess: string,
  referenceAnswers: string | string[],
  referenceIncorrect: string[] = []
): boolean {
  // Normalize inputs
  if (typeof referenceAnswers === 'string') {
    referenceAnswers = [referenceAnswers];
  }

  const normalizedGuess = normalize(guess);
  const normalizedIncorrect = referenceIncorrect.map(normalize);

  // Check if explicitly incorrect
  if (normalizedIncorrect.includes(normalizedGuess)) {
    return false;
  }

  // Check against reference answers
  const normalizedRefs = referenceAnswers.map(normalize);

  // Use the plural-aware matching
  return doublecheckPlural(normalizedRefs, normalizedGuess);
}

/**
 * Extract the core answer from an answer line that may contain
 * formatting like bold, underline, or parenthetical notes
 *
 * @param answerLine - The full answer line (may contain HTML)
 * @returns Cleaned answer text
 */
export function cleanAnswerLine(answerLine: string): string {
  // Remove HTML tags
  let cleaned = answerLine.replace(/<[^>]*>/g, '');

  // Remove common formatting markers
  cleaned = cleaned
    .replace(/\*\*/g, '') // Bold markdown
    .replace(/__/g, '') // Underline markdown
    .replace(/\[/g, '')
    .replace(/\]/g, '');

  // Trim whitespace
  return cleaned.trim();
}
