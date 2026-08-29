import type { Metadata } from "next";
import { recordedCase } from "@/lib/recorded-case";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "TrueForge #417 recorded reproduction",
  description:
    "The executed reproduction for TrueForge issue #417: twenty runs across a failing condition and its control, with the command, exit code and integrity hash.",
};

export default function RecordedCasePage() {
  const { conditions, source, integrity, capturedAt, verdict } = recordedCase;
  const failing = conditions.find((item) => item.matched > 0);
  const control = conditions.find((item) => item.matched === 0);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Recorded reproduction</p>
        <h1>
          {source.repository}#{source.issueNumber}
        </h1>
        <p className={styles.lede}>
          This page is the executed record, not a fixture. Every run below ran
          against <code>{source.artifact}</code>. The numbers are what the runs
          returned.
        </p>
        <dl className={styles.summary}>
          <div>
            <dt>Verdict</dt>
            <dd className={styles.verdict}>{verdict}</dd>
          </div>
          <div>
            <dt>Captured</dt>
            <dd>{new Date(capturedAt).toISOString().slice(0, 19).replace("T", " ")} UTC</dd>
          </div>
          <div>
            <dt>Integrity</dt>
            <dd>
              <code>{integrity.algorithm} {integrity.evidenceSha256.slice(0, 16)}…</code>
            </dd>
          </div>
        </dl>
        <p className={styles.note}>
          The hash is recomputed by CI on <code>main</code> and on every pull
          request:{" "}
          <code>pnpm --filter @verdict/agent verify:runtime-evidence</code>
        </p>
      </header>

      <section className={styles.contrast}>
        <h2>The contrast is the evidence</h2>
        <p>
          A condition that fails every time is only meaningful next to one that
          never does. Both ran the same command the same number of times.
        </p>
        <div className={styles.contrastGrid}>
          {[failing, control].filter(Boolean).map((condition) => (
            <article
              key={condition!.conditionId}
              className={
                condition!.matched > 0 ? styles.failingCard : styles.controlCard
              }
            >
              <h3>
                <code>{condition!.conditionId}</code>
              </h3>
              <p className={styles.ratio}>
                {condition!.matched} of {condition!.observed}
              </p>
              <p className={styles.state}>{condition!.state}</p>
            </article>
          ))}
        </div>
      </section>

      {conditions.map((condition) => (
        <section key={condition.conditionId} className={styles.conditionSection}>
          <h2>
            <code>{condition.conditionId}</code>
          </h2>
          <p className={styles.conditionMeta}>
            {condition.state}, {condition.matched} of {condition.observed} runs
            matched
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Run</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Exit</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Observed</th>
                </tr>
              </thead>
              <tbody>
                {condition.runs.map((run) => (
                  <tr key={run.runId}>
                    <th scope="row">
                      <code>{run.runId}</code>
                    </th>
                    <td>{run.outcome}</td>
                    <td>{run.exitCode === null ? "none" : run.exitCode}</td>
                    <td>{run.durationMs} ms</td>
                    <td className={styles.excerpt}>{run.outputExcerpt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className={styles.command}>
            <summary>The command every run executed</summary>
            <pre>
              <code>{condition.runs[0]?.command}</code>
            </pre>
            <p>
              Against commit <code>{condition.runs[0]?.commitSha}</code>
            </p>
          </details>
        </section>
      ))}

      <footer className={styles.footer}>
        <p>
          The interactive workspace at <a href="/case/demo">/case/demo</a> is a
          fixture with generated numbers, and says so on every screen. This page
          is the executed record it is modelled on.
        </p>
      </footer>
    </main>
  );
}
