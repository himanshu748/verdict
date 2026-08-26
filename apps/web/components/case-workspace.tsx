"use client";

import {
  ArrowLeft,
  ArrowSquareOut,
  ClipboardText,
  Crosshair,
  FileText,
  GitCommit,
  GitPullRequest,
  LockKey,
  Scales,
  ShieldCheck,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { DemoCase } from "@/lib/demo-case";

type PhaseId = "contract" | "hunter" | "surgeon" | "insurance" | "verdict";
type ApprovalDecision = "pending" | "denied";

const phases = [
  { id: "contract", label: "Contract", meta: "Scope", icon: ClipboardText },
  { id: "hunter", label: "Hunter", meta: "Act I", icon: Crosshair },
  { id: "surgeon", label: "Surgeon", meta: "Act II", icon: GitCommit },
  { id: "insurance", label: "Insurance", meta: "Act III", icon: ShieldCheck },
  { id: "verdict", label: "Verdict", meta: "Evidence", icon: Scales },
] as const;

function stateLabel(state: DemoCase["conditions"][number]["result"]["state"]) {
  switch (state) {
    case "REPRODUCTION_PINNED":
      return "Pinned";
    case "PARTIAL_REPRODUCTION":
      return "Partial";
    case "WEAK_SIGNAL":
      return "Weak signal";
    case "NOT_REPRODUCED":
      return "Not reproduced";
    case "UNRESOLVED":
      return "Unresolved";
  }
}

function shortSha(sha: string) {
  return sha.slice(0, 8);
}

function outcomeLabel(outcome: DemoCase["conditions"][number]["records"][number]["outcome"]) {
  switch (outcome) {
    case "FAIL_MATCH":
      return "Generated signature match";
    case "PASS":
      return "Generated inside budget";
    case "UNRESOLVED":
      return "Generated unresolved";
  }
}

function relationshipLabel(relationship: DemoCase["history"][number]["relationship"]) {
  return relationship === "IMMEDIATE_PARENT" ? "Immediate parent" : "Static-diff suspect";
}

export function CaseWorkspace({ data }: { data: DemoCase }) {
  const [activePhase, setActivePhase] = useState<PhaseId>("hunter");
  const [selectedConditionId, setSelectedConditionId] = useState<string>(
    data.selectedConditionId,
  );
  const selectedCondition =
    data.conditions.find((condition) => condition.id === selectedConditionId) ??
    data.conditions[0];
  const pinnedCondition =
    data.conditions.find((condition) => condition.id === data.selectedConditionId) ??
    data.conditions[0];
  const [selectedRunId, setSelectedRunId] = useState<string>(
    selectedCondition?.records[0]?.runId ?? "",
  );
  const [approvalDecision, setApprovalDecision] = useState<ApprovalDecision>("pending");

  const selectedRecord = useMemo(() => {
    return (
      selectedCondition?.records.find((record) => record.runId === selectedRunId) ??
      selectedCondition?.records[0]
    );
  }, [selectedCondition, selectedRunId]);

  if (
    selectedCondition === undefined ||
    selectedRecord === undefined ||
    pinnedCondition === undefined
  ) {
    return null;
  }

  function chooseCondition(conditionId: string) {
    const condition = data.conditions.find((item) => item.id === conditionId);
    if (condition === undefined) {
      return;
    }
    setSelectedConditionId(conditionId);
    setSelectedRunId(condition.records[0]?.runId ?? "");
  }

  function choosePhase(phaseId: PhaseId) {
    setActivePhase(phaseId);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const heading = document.getElementById(`${phaseId}-heading`);
        heading?.scrollIntoView({ block: "start" });
        heading?.focus({ preventScroll: true });
      });
    });
  }

  return (
    <div className="case-shell">
      <a className="skip-link" href="#case-main">Skip to case evidence</a>
      <header className="case-topbar">
        <Link className="case-home" href="/">
          <ArrowLeft aria-hidden="true" size={17} weight="regular" />
          <span>Verdict</span>
        </Link>
        <div className="case-source">
          <span>CASE TF-417</span>
          <a href={data.source.issueUrl} rel="noreferrer" target="_blank">
            truefoundry/trueforge#{data.source.issueNumber}
            <ArrowSquareOut aria-hidden="true" size={14} weight="regular" />
          </a>
        </div>
        <div className="case-top-actions">
          <span className="fixture-status">Simulated fixture v{data.fixtureVersion}</span>
          <ThemeToggle />
        </div>
      </header>

      <div className="case-layout">
        <aside className="case-sidebar">
          <div className="case-state-block">
            <span>Fixture conclusion</span>
            <strong>
              <FileText aria-hidden="true" size={17} weight="regular" />
              Generated reproduction
            </strong>
            <small>{data.selectedResult.matched}/{data.selectedResult.observed} generated records match. Execution status: not run.</small>
          </div>

          <nav aria-label="Case phases" className="phase-list">
            {phases.map(({ id, label, meta, icon: Icon }) => (
              <button
                aria-current={activePhase === id ? "step" : undefined}
                className="phase-button"
                key={id}
                onClick={() => choosePhase(id)}
                type="button"
              >
                <Icon aria-hidden="true" size={18} weight="regular" />
                <span>
                  <small>{meta}</small>
                  <strong>{label}</strong>
                </span>
                <span className="phase-state">Modeled</span>
              </button>
            ))}
          </nav>

          <div className="agent-trace">
            <span>TrueForge execution design</span>
            <div><ClipboardText aria-hidden="true" size={14} />Hunter prompt bounded</div>
            <div><ClipboardText aria-hidden="true" size={14} />Surgeon prompt bounded</div>
            <small>No live thread events are claimed by this fixture.</small>
          </div>
        </aside>

        <main className="case-main" id="case-main">
          <header className="case-titlebar">
            <div>
              <span>TRUEFOUNDRY / TRUEFORGE / ISSUE 417</span>
              <h1>{data.source.title}</h1>
            </div>
            <div className="case-title-meta">
              <span>Fixture reference</span>
              <code>{shortSha(data.source.reportCommit)}</code>
            </div>
          </header>

          {activePhase === "contract" ? (
            <section className="case-phase" aria-labelledby="contract-heading">
              <div className="phase-heading">
                <div>
                  <span>Investigation contract</span>
                  <h2 id="contract-heading" tabIndex={-1}>Bound the question before running code.</h2>
                </div>
                <span className="read-only-state"><LockKey aria-hidden="true" size={14} /> Read-only</span>
              </div>
              <div className="contract-grid">
                <dl className="case-definition-list">
                  <div><dt>Repository</dt><dd>{data.source.repository}</dd></div>
                  <div><dt>Failure signature</dt><dd>{data.contract.signature}</dd></div>
                  <div><dt>Selected request budget</dt><dd>{data.contract.requestBudgetMs} ms</dd></div>
                  <div><dt>Threshold</dt><dd>{data.contract.threshold} valid observations</dd></div>
                  <div><dt>Condition space</dt><dd>{data.contract.matrixSize} request budget and upstream pairs</dd></div>
                  <div><dt>Permission</dt><dd>{data.contract.permissionMode}</dd></div>
                </dl>
                <div className="contract-command">
                  <span>{data.contract.commandPurpose}</span>
                  <code>{data.contract.command}</code>
                  <p>Fixture status: proposed, not implemented. Execution status: not run. A future harness run would record exit code, duration, environment and a bounded output excerpt.</p>
                </div>
              </div>
            </section>
          ) : null}

          {activePhase === "hunter" ? (
            <section className="case-phase" aria-labelledby="hunter-heading">
              <div className="phase-heading">
                <div>
                  <span>Act I / Hunter</span>
                  <h2 id="hunter-heading" tabIndex={-1}>Model the smallest repeatable envelope.</h2>
                </div>
                <span className="terminal-state">Generated {stateLabel(selectedCondition.result.state)}</span>
              </div>

              <div className="hunt-workbench">
                <div className="case-matrix" aria-label="Simulated condition matrix">
                  <div className="case-matrix-heading">
                    <span>Request budget × upstream behavior</span>
                    <span>10 generated records each</span>
                  </div>
                  <div className="case-matrix-grid">
                    {data.conditions.map((condition) => {
                      const selected = condition.id === selectedCondition.id;
                      const label = stateLabel(condition.result.state);
                      return (
                        <button
                          aria-label={`Condition ${condition.id}: ${condition.requestBudgetMs} millisecond budget, ${condition.upstream}, ${label}`}
                          aria-pressed={selected}
                          className={`case-cell state-${condition.result.state.toLowerCase().replaceAll("_", "-")}`}
                          key={condition.id}
                          onClick={() => chooseCondition(condition.id)}
                          type="button"
                        >
                          <span className="case-cell-top"><code>{condition.id}</code><span>{condition.result.matched}/{condition.result.observed}</span></span>
                          <span className="case-cell-body"><strong>{condition.requestBudgetMs} ms budget</strong><span>{condition.upstream}</span></span>
                          <span className="case-cell-state">{label}</span>
                          {selected ? <span aria-hidden="true" className="case-grease-circle" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <aside className="run-inspector" aria-label="Selected run inspector">
                  <div className="inspector-heading">
                    <div><span>Selected generated condition</span><strong>{selectedCondition.id}</strong></div>
                    <span>{selectedCondition.requestBudgetMs} ms budget / {selectedCondition.upstream}</span>
                  </div>
                  <div className="run-strip" aria-label="Generated example records">
                    {selectedCondition.records.map((record, index) => (
                      <button
                        aria-label={`Inspect run ${index + 1}: ${outcomeLabel(record.outcome)}`}
                        aria-pressed={record.runId === selectedRecord.runId}
                        className={`run-dot outcome-${record.outcome.toLowerCase()}`}
                        key={record.runId}
                        onClick={() => setSelectedRunId(record.runId)}
                        type="button"
                      >
                        {String(index + 1).padStart(2, "0")}
                      </button>
                    ))}
                  </div>
                  <dl className="run-record">
                    <div><dt>Outcome</dt><dd>{outcomeLabel(selectedRecord.outcome)}</dd></div>
                    <div><dt>Generated duration</dt><dd>{selectedRecord.durationMs} ms</dd></div>
                    <div><dt>Exit code</dt><dd>{selectedRecord.exitCode ?? "none"}</dd></div>
                    <div><dt>Commit</dt><dd>{shortSha(selectedRecord.commitSha)}</dd></div>
                    <div><dt>Run ID</dt><dd>{selectedRecord.runId}</dd></div>
                  </dl>
                  <div className="output-excerpt">
                    <span>Generated output excerpt</span>
                    <code>{selectedRecord.outputExcerpt}</code>
                  </div>
                </aside>
              </div>
            </section>
          ) : null}

          {activePhase === "surgeon" ? (
            <section className="case-phase" aria-labelledby="surgeon-heading">
              <div className="phase-heading">
                <div>
                  <span>Act II / Surgeon</span>
                  <h2 id="surgeon-heading" tabIndex={-1}>Inspect a static-diff suspect range.</h2>
                </div>
                <span className="terminal-state">Runtime not run</span>
              </div>
              <div className="boundary-summary">
                <div><span>Immediate parent</span><code>{shortSha(data.suspectRange.immediateParentCommit)}</code></div>
                <ArrowSquareOut aria-hidden="true" size={20} weight="regular" />
                <div><span>Static-diff suspect</span><code>{shortSha(data.suspectRange.suspectCommit)}</code></div>
              </div>
              <ol className="history-list">
                {data.history.map((entry) => (
                  <li className={`history-${entry.outcome.toLowerCase()}`} key={entry.commitSha}>
                    <span className="history-glyph">
                      <FileText aria-hidden="true" />
                    </span>
                    <a href={entry.url} rel="noreferrer" target="_blank">
                      <code>{shortSha(entry.commitSha)}</code>
                      <strong>{entry.title}</strong>
                    </a>
                    <span>{entry.date}</span>
                    <span>{relationshipLabel(entry.relationship)}</span>
                  </li>
                ))}
              </ol>
              <p className="case-note">{data.suspectRange.basis}</p>
            </section>
          ) : null}

          {activePhase === "insurance" ? (
            <section className="case-phase" aria-labelledby="insurance-heading">
              <div className="phase-heading">
                <div>
                  <span>Act III / Insurance</span>
                  <h2 id="insurance-heading" tabIndex={-1}>Define a test plan, then stop at the write boundary.</h2>
                </div>
                <span className="approval-state"><LockKey aria-hidden="true" size={14} /> Approval required</span>
              </div>
              <div className="publication-manifest test-plan-panel">
                <header><ClipboardText aria-hidden="true" size={18} /><span>Proposed Jest regression plan</span><strong>{data.testPlan.status}</strong></header>
                <dl>
                  <div><dt>Existing test file</dt><dd><code>{data.testPlan.path}</code></dd></div>
                  <div><dt>Command</dt><dd><code>{data.testPlan.command}</code></dd></div>
                  <div><dt>Scenario</dt><dd>{data.testPlan.scenario}</dd></div>
                  <div><dt>Expected before fix</dt><dd>{data.testPlan.expectedBeforeFix}</dd></div>
                  <div><dt>Expected after fix</dt><dd>{data.testPlan.expectedAfterFix}</dd></div>
                </dl>
              </div>
              <div className="insurance-grid">
                <div className="publication-manifest">
                  <header><GitPullRequest aria-hidden="true" size={18} /><span>Proposed draft PR</span><strong>{data.publication.status}</strong></header>
                  <dl>
                    <div><dt>Target</dt><dd>{data.publication.targetRepository}</dd></div>
                    <div><dt>Proposed branch</dt><dd>{data.publication.branch}</dd></div>
                    <div><dt>Proposed workflow</dt><dd>{data.publication.workflow}</dd></div>
                    <div>
                      <dt>Files</dt>
                      <dd>
                        <ul className="manifest-file-list">
                          {data.publication.files.map((file) => <li key={file}><code>{file}</code></li>)}
                        </ul>
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="approval-gate">
                  <LockKey aria-hidden="true" size={24} />
                  <h3 aria-live="polite" role="status">{approvalDecision === "denied" ? "Public write denied." : "Default decision: deny."}</h3>
                  <p>
                    {approvalDecision === "denied"
                      ? "Evidence remains available. No workflow was triggered and no GitHub mutation occurred."
                      : "TrueForge pauses only when one actions_run_trigger call exactly matches the reviewed workflow target. A denial creates no branch, commit or pull request."}
                  </p>
                  <div className="approval-actions">
                    <button className="button button-secondary" onClick={() => setApprovalDecision("denied")} type="button">
                      Deny public write
                    </button>
                    <button className="button button-primary" disabled type="button">
                      Approve live write
                    </button>
                  </div>
                  <small>The demo keeps live approval disabled. A configured session must present one exact pending workflow dispatch.</small>
                </div>
              </div>
            </section>
          ) : null}

          {activePhase === "verdict" ? (
            <section className="case-phase" aria-labelledby="verdict-heading">
              <div className="phase-heading">
                <div>
                  <span>Evidence package</span>
                  <h2 id="verdict-heading" tabIndex={-1}>A clearly labeled simulated artifact.</h2>
                </div>
                <span className="terminal-state">Generated result</span>
              </div>
              <article className="verdict-document">
                <header>
                  <div><span>VERDICT / TF-417</span><strong>SIMULATED REPRODUCTION_PINNED</strong></div>
                  <Scales aria-hidden="true" size={32} weight="regular" />
                </header>
                <dl>
                  <div><dt>Evidence mode</dt><dd>Conceptual simulation</dd></div>
                  <div><dt>Observed</dt><dd>{data.selectedResult.matched}/{data.selectedResult.observed} generated records</dd></div>
                  <div><dt>Condition</dt><dd>{pinnedCondition.requestBudgetMs} ms budget / {pinnedCondition.upstream}</dd></div>
                  <div><dt>Suspect range</dt><dd>{shortSha(data.suspectRange.immediateParentCommit)} to {shortSha(data.suspectRange.suspectCommit)}</dd></div>
                  <div><dt>Runtime polarity</dt><dd>Not established</dd></div>
                  <div><dt>Public write</dt><dd>Not performed</dd></div>
                </dl>
              </article>
              <div className="artifact-actions">
                <a className="button button-primary" href="/api/cases/demo/evidence">
                  <FileText aria-hidden="true" size={17} /> Download verdict.json
                </a>
                <a className="button button-secondary" href="/api/cases/demo/report">
                  <FileText aria-hidden="true" size={17} /> Download VERDICT.md
                </a>
              </div>
            </section>
          ) : null}
        </main>
      </div>

      <nav aria-label="Case phases" className="mobile-phase-nav">
        {phases.map(({ id, label, icon: Icon }) => (
          <button
            aria-current={activePhase === id ? "step" : undefined}
            key={id}
            onClick={() => choosePhase(id)}
            type="button"
          >
            <Icon aria-hidden="true" size={18} weight="regular" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
