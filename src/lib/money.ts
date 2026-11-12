/**
 * Money utilities for Joykali EV Mobility
 * All monetary amounts are internally stored as integer paise (1 INR = 100 paise)
 */

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/**
 * Format paise into Indian Currency format, e.g., ₹1,23,456.00 or ₹1,23,456
 */
export function formatINR(paise: number, includeDecimals = true): string {
  const rupees = paise / 100;
  const isNegative = rupees < 0;
  const absRupees = Math.abs(rupees);

  const [integerPart, decimalPart] = absRupees.toFixed(2).split(".");

  // Indian numbering system formatting: last 3 digits, then groups of 2 digits
  let result = "";
  if (integerPart.length <= 3) {
    result = integerPart;
  } else {
    const lastThree = integerPart.substring(integerPart.length - 3);
    const otherNumbers = integerPart.substring(0, integerPart.length - 3);
    const withCommas = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    result = `${withCommas},${lastThree}`;
  }

  const formatted = includeDecimals ? `${result}.${decimalPart}` : result;
  return `${isNegative ? "-" : ""}₹${formatted}`;
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function convertLessThanOneThousand(num: number): string {
  let current = "";
  if (num >= 100) {
    current += ONES[Math.floor(num / 100)] + " Hundred ";
    num %= 100;
  }
  if (num >= 20) {
    const tens = TENS[Math.floor(num / 10)];
    const remainder = num % 10;
    if (remainder > 0) {
      current += `${tens}-${ONES[remainder]} `;
    } else {
      current += `${tens} `;
    }
    num = 0;
  } else if (num > 0) {
    current += ONES[num] + " ";
  }
  return current.trim();
}

/**
 * Converts paise into Indian English words: e.g. "Rupees Twenty-Three Thousand Four Hundred Only"
 */
export function numberToWordsINR(paise: number): string {
  const rupees = Math.floor(Math.abs(paise) / 100);
  const paiseRemainder = Math.abs(paise) % 100;

  if (rupees === 0 && paiseRemainder === 0) {
    return "Rupees Zero Only";
  }

  let crore = Math.floor(rupees / 10000000);
  let remainder = rupees % 10000000;
  let lakh = Math.floor(remainder / 100000);
  remainder = remainder % 100000;
  let thousand = Math.floor(remainder / 1000);
  let hundred = remainder % 1000;

  let words = "";

  if (crore > 0) {
    words += convertLessThanOneThousand(crore) + " Crore ";
  }
  if (lakh > 0) {
    words += convertLessThanOneThousand(lakh) + " Lakh ";
  }
  if (thousand > 0) {
    words += convertLessThanOneThousand(thousand) + " Thousand ";
  }
  if (hundred > 0) {
    words += convertLessThanOneThousand(hundred) + " ";
  }

  words = words.trim();
  let result = `Rupees ${words}`;

  if (paiseRemainder > 0) {
    result += ` and ${convertLessThanOneThousand(paiseRemainder)} Paise`;
  }

  result += " Only";
  return result;
}
