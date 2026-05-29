export type Transaction = {
  id: string;
  sourceFile: string;
  page: number;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance?: number;
  raw: string;
};

export type Summary = {
  count: number;
  totalDebit: number;
  totalCredit: number;
  net: number;
};

const DATE_PATTERN = String.raw`(?:\d{1,2}[/-]\d{1,2}[/-](?:\d{2}|\d{4})|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})`;
const MONEY_PATTERN = String.raw`(?:₹|INR|Rs\.?|USD|\$)?\s*-?\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|-?\d+(?:\.\d{1,2})?`;
const transactionLineRegex = new RegExp(String.raw`^\s*(${DATE_PATTERN})\s+(.+?)\s+(${MONEY_PATTERN})(?:\s+(${MONEY_PATTERN}))?(?:\s+(${MONEY_PATTERN}))?\s*$`, "i");
const debitWords = /\b(?:debit|debited|withdrawal|dr|paid|payment|sent|transfer to|upi\/dr|pos|atm|neft dr|imps dr|rtgs dr)\b/i;
const creditWords = /\b(?:credit|credited|deposit|cr|received|refund|salary|interest|transfer from|upi\/cr|neft cr|imps cr|rtgs cr)\b/i;

export function normalizeAmount(value?: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/(?:₹|INR|Rs\.?|USD|\$)/gi, "").replace(/,/g, "").trim();
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeDate(value: string): string {
  const trimmed = value.trim().replaceAll("/", "-");
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  const numericMatch = /^(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})$/.exec(trimmed);
  if (numericMatch) {
    const year = numericMatch[3].length === 2 ? `20${numericMatch[3]}` : numericMatch[3];
    return `${year}-${numericMatch[2].padStart(2, "0")}-${numericMatch[1].padStart(2, "0")}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return trimmed;
}

export function parseTransactionsFromText(text: string, sourceFile: string, page: number): Transaction[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap((line, index) => {
      const match = transactionLineRegex.exec(line);
      if (!match) return [];

      const [, date, description, firstAmount, secondAmount, thirdAmount] = match;
      const amounts = [firstAmount, secondAmount, thirdAmount].filter(Boolean) as string[];
      const normalizedAmounts = amounts.map(normalizeAmount);
      const lowerDescription = description.toLowerCase();

      let debit = 0;
      let credit = 0;
      let balance: number | undefined;

      if (amounts.length >= 3) {
        [debit, credit, balance] = normalizedAmounts;
      } else if (amounts.length === 2) {
        const [amount, possibleBalance] = normalizedAmounts;
        balance = possibleBalance;
        if (creditWords.test(lowerDescription) && !debitWords.test(lowerDescription)) {
          credit = amount;
        } else {
          debit = amount;
        }
      } else if (creditWords.test(lowerDescription) && !debitWords.test(lowerDescription)) {
        credit = normalizedAmounts[0];
      } else {
        debit = normalizedAmounts[0];
      }

      return [{
        id: `${sourceFile}-${page}-${index}`,
        sourceFile,
        page,
        date: normalizeDate(date),
        description: description.trim(),
        debit,
        credit,
        balance,
        raw: line,
      }];
    });
}

export function searchTransactions(transactions: Transaction[], keyword: string): Transaction[] {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) return transactions;

  return transactions.filter((transaction) =>
    [transaction.date, transaction.description, transaction.raw, transaction.sourceFile]
      .join(" ")
      .toLowerCase()
      .includes(normalizedKeyword),
  );
}

export function summarizeTransactions(transactions: Transaction[]): Summary {
  return transactions.reduce<Summary>(
    (summary, transaction) => ({
      count: summary.count + 1,
      totalDebit: summary.totalDebit + transaction.debit,
      totalCredit: summary.totalCredit + transaction.credit,
      net: summary.net + transaction.credit - transaction.debit,
    }),
    { count: 0, totalDebit: 0, totalCredit: 0, net: 0 },
  );
}
