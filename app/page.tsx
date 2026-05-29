"use client";

import { useMemo, useState } from "react";
import { parseTransactionsFromText, searchTransactions, summarizeTransactions, type Transaction } from "../src/lib/transactions";

type ProcessingStatus = {
  state: "idle" | "processing" | "done" | "error";
  message: string;
};

type PageText = {
  sourceFile: string;
  page: number;
  text: string;
  usedOcr: boolean;
};

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

async function extractPageTextWithOcr(page: any, enableOcr: boolean): Promise<{ text: string; usedOcr: boolean }> {
  const content = await page.getTextContent();
  const text = content.items
    .map((item: { str?: string }) => item.str ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (text || !enableOcr) {
    return { text, usedOcr: false };
  }

  const { createWorker } = await import("tesseract.js");
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return { text: "", usedOcr: false };

  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, canvasContext: context, viewport }).promise;

  const worker = await createWorker("eng");
  try {
    const result = await worker.recognize(canvas);
    return { text: result.data.text, usedOcr: true };
  } finally {
    await worker.terminate();
  }
}

async function parsePdfFiles(files: File[], enableOcr: boolean, onProgress: (message: string) => void): Promise<{ transactions: Transaction[]; pages: PageText[] }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const allTransactions: Transaction[] = [];
  const pages: PageText[] = [];

  for (const file of files) {
    onProgress(`Reading ${file.name}...`);
    const bytes = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: bytes }).promise;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress(`Scanning ${file.name}, page ${pageNumber} of ${pdf.numPages}...`);
      const page = await pdf.getPage(pageNumber);
      const { text, usedOcr } = await extractPageTextWithOcr(page, enableOcr);
      pages.push({ sourceFile: file.name, page: pageNumber, text, usedOcr });
      allTransactions.push(...parseTransactionsFromText(text, file.name, pageNumber));
      page.cleanup();
    }

    await pdf.destroy();
  }

  return { transactions: allTransactions, pages };
}

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pages, setPages] = useState<PageText[]>([]);
  const [keyword, setKeyword] = useState("");
  const [enableOcr, setEnableOcr] = useState(false);
  const [status, setStatus] = useState<ProcessingStatus>({ state: "idle", message: "Upload one or more PDF bank statements to begin." });

  const filteredTransactions = useMemo(() => searchTransactions(transactions, keyword), [transactions, keyword]);
  const summary = useMemo(() => summarizeTransactions(filteredTransactions), [filteredTransactions]);
  const scannedPageCount = pages.filter((page) => page.usedOcr).length;

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (!files.length) {
      setStatus({ state: "error", message: "Please choose at least one PDF file." });
      return;
    }

    setStatus({ state: "processing", message: "Starting secure in-browser processing..." });
    setTransactions([]);
    setPages([]);
    setKeyword("");

    try {
      const result = await parsePdfFiles(files, enableOcr, (message) => setStatus({ state: "processing", message }));
      setTransactions(result.transactions);
      setPages(result.pages);
      setStatus({
        state: "done",
        message: `Finished ${files.length} file${files.length === 1 ? "" : "s"}. Extracted ${result.transactions.length} transaction-like rows from ${result.pages.length} pages.`,
      });
    } catch (error) {
      setStatus({ state: "error", message: error instanceof Error ? error.message : "Unable to process the selected PDFs." });
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Private PDF transaction analyzer</p>
          <h1>Find names, keywords, credits, and debits across long bank statements.</h1>
          <p className="heroText">
            Statement Finder converts uploaded PDFs into structured transaction rows in your browser, then searches and summarizes matching activity instantly.
          </p>
        </div>
        <div className="privacyCard">
          <strong>Privacy-first MVP</strong>
          <span>PDF files are processed locally in the browser and are not uploaded to a server.</span>
        </div>
      </section>

      <section className="panel uploadPanel">
        <label className="dropZone">
          <input type="file" accept="application/pdf,.pdf" multiple onChange={(event) => void handleFiles(event.target.files)} />
          <span>Upload bank statement PDFs</span>
          <small>Supports multiple PDFs. Text PDFs are fastest; enable OCR for scanned statements.</small>
        </label>
        <label className="checkboxRow">
          <input type="checkbox" checked={enableOcr} onChange={(event) => setEnableOcr(event.target.checked)} />
          Enable OCR fallback for pages without embedded text
        </label>
        <p className={`status ${status.state}`}>{status.message}</p>
      </section>

      <section className="metricsGrid" aria-label="Transaction summary">
        <article className="metric"><span>Matches</span><strong>{summary.count}</strong></article>
        <article className="metric"><span>Total credited</span><strong>{currencyFormatter.format(summary.totalCredit)}</strong></article>
        <article className="metric"><span>Total debited</span><strong>{currencyFormatter.format(summary.totalDebit)}</strong></article>
        <article className="metric"><span>Net summary</span><strong className={summary.net >= 0 ? "positive" : "negative"}>{currencyFormatter.format(summary.net)}</strong></article>
      </section>

      <section className="panel searchPanel">
        <div className="searchHeader">
          <div>
            <h2>Filtered transactions</h2>
            <p>{transactions.length} parsed rows · {pages.length} pages scanned · {scannedPageCount} OCR pages</p>
          </div>
          <input
            type="search"
            placeholder="Search name or keyword, e.g. Manikandan"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description / Transaction name</th>
                <th>Debit</th>
                <th>Credit</th>
                <th>Balance</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.length ? filteredTransactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{transaction.date}</td>
                  <td>{transaction.description}</td>
                  <td>{transaction.debit ? currencyFormatter.format(transaction.debit) : "—"}</td>
                  <td>{transaction.credit ? currencyFormatter.format(transaction.credit) : "—"}</td>
                  <td>{transaction.balance === undefined ? "—" : currencyFormatter.format(transaction.balance)}</td>
                  <td>{transaction.sourceFile}, p.{transaction.page}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="emptyState">No matching transactions yet. Upload PDFs or adjust your keyword.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="architecture">
        <h2>Production path</h2>
        <div className="architectureGrid">
          <article><strong>MVP stack</strong><span>Next.js + browser PDF.js + optional Tesseract OCR + Firebase when accounts are needed.</span></article>
          <article><strong>Scale stack</strong><span>Next.js + FastAPI + AWS Textract + PostgreSQL + Redis/BullMQ + encrypted S3 lifecycle deletion.</span></article>
          <article><strong>Data model</strong><span>Convert every PDF into structured JSON before search so filtering and analytics stay fast.</span></article>
        </div>
      </section>
    </main>
  );
}
