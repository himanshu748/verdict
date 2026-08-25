"use client";

import {
  ArrowLeft,
  ArrowSquareOut,
  CheckCircle,
  ClipboardText,
  Crosshair,
  FileText,
  GitCommit,
  GitPullRequest,
  LockKey,
  Scales,
  ShieldCheck,
  XCircle,
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
      return "Signature matched";
    case "PASS":
      return "Completed inside budget";
    case "UNRESOLVED":
      return "Unresolved";
  }
}

export function CaseWorkspace({ data }: { data: DemoCase }) {
  const [activePhase, setActivePhase] = useState<PhaseId>("hunter");
  const [selectedConditionId, setSelectedConditionId] = useState<string>(
    data.selectedConditionId,
  );
  const selectedCondition =
    data.conditions.find((condition) => condition.id === selectedConditionId) ??
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

  if (selectedCondition === undefined || selectedRecord === undefined) {
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
            <span>Terminal verdict</span>
            <strong>
              <CheckCircle aria-hidden="true" size={17} weight="regular" />
              Reproduction pinned
            </strong>
            <small>{data.selectedResult.matched}/{data.selectedResult.observed} valid runs matched</small>
          </div>

          <nav aria-label="Case phases" className="phase-list">
            {phases.map(({ id, label, meta, icon: Icon }) => (
              <button
                aria-current={activePhase === id ? "step" : undefined}
                className="phase-button"
                key={id}
                onClick={() => setActivePhase(id)}
                type="button"
              >
                <Icon aria-hidden="true" size={18} weight="regular" />
                <span>
                  <small>{meta}</small>
                  <strong>{label}</strong>
                </span>
                <span className="phase-state">Complete</span>
              </button>
            ))}
          </nav>

          <div className="agent-trace">
            <span>TrueForge thread trace</span>
            <div><CheckCircle aria-hidden="true" size={14} />Hunter investigator</div>
            <div><CheckCircle aria-hidden="true" size={14} />History investigator</div>
            <small>Dynamic subagent events are projected by `apps/agent`.</small>
          </div>
        </aside>

        <main className="case-main" id="case-main">
          <header className="case-titlebar">
            <div>
              <span>TRUEFOUNDRY / TRUEFORGE / ISSUE 417</span>
              <h1>{data.source.title}</h1>
            </div>
            <div className="case-title-meta">
              <span>Baseline</span>
              <code>{shortSha(data.source.reportCommit)}</code>
            </div>
          </header>

          {activePhase === "contract" ? (
            <section className="case-phase" aria-labelledby="contract-heading">
              <div className="phase-heading">
                <div>
                  <span>Investigation contract</span>
                  <h2 id="contract-heading">Bound the question before running code.</h2>
                </div>
                <span className="read-only-state"><LockKey aria-hidden="true" size={14} /> Read-only</span>
              </div>
              <div className="contract-grid">
                <dl className="case-definition-list">
                  <div><dt>Repository</dt><dd>{data.source.repository}</dd></div>
                  <div><dt>Failure signature</dt><dd>{data.contract.signature}</dd></div>
                  <div><dt>Observation budget</dt><dd>{data.contract.observationBudgetMs} ms per run</dd></div>
                  <div><dt>Threshold</dt><dd>{data.contract.threshold} valid observations</dd></div>
                  <div><dt>Condition space</dt><dd>{data.contract.matrixSize} endpoint and upstream pairs</dd></div>
                  <div><dt>Permission</dt><dd>{data.contract.permissionMode}</dd></div>
                </dl>
                <div className="contract-command">
                  <span>Bounded command</span>
                  <code>{data.contract.command}</code>
                  <p>The harness records exit code, duration, environment and a bounded output excerpt for every run.</p>
                </div>
              </div>
            </section>
          ) : null}

          {activePhase === "hunter" ? (
            <section className="case-phase" aria-labelledby="hunter-heading">
              <div className="phase-heading">
                <div>
                  <span>Act I · Hunter</span>
                  <h2 id="hunter-heading">Find the smallest repeatable envelope.</h2>
                </div>
                <span className="terminal-state">{stateLabel(selectedCondition.result.state)}</span>
              </div>

              <div className="hunt-workbench">
                <div className="case-matrix" aria-label="Recorded condition matrix">
                  <div className="case-matrix-heading">
                    <span>Endpoint × upstream behavior</span>
                    <span>10 trials each</span>
                  </div>
                  <div className="case-matrix-grid">
                    {data.conditions.map((condition) => {
                      const selected = condition.id === selectedCondition.id;
                      const label = stateLabel(condition.result.state);
                      return (
                        <button
                          aria-label={`Condition ${condition.id}: ${condition.endpoint}, ${condition.upstream}, ${label}`}
                          aria-pressed={selected}
                          className={`case-cell state-${condition.result.state.toLowerCase().replaceAll("_", "-")}`}
                          key={condition.id}
                          onClick={() => chooseCondition(condition.id)}
                          type="button"
                        >
                          <span className="case-cell-top"><code>{condition.id}</code><span>{condition.result.matched}/{condition.result.observed}</span></span>
                          <span className="case-cell-body"><strong>{condition.endpoint}</strong><span>{condition.upstream}</span></span>
                          <span className="case-cell-state">{label}</span>
                          {selected ? <span aria-hidden="true" className="case-grease-circle" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <aside className="run-inspector" aria-label="Selected run inspector">
                  <div className="inspector-heading">
                    <div><span>Selected condition</span><strong>{selectedCondition.id}</strong></div>
                    <span>{selectedCondition.endpoint} / {selectedCondition.upstream}</span>
                  </div>
                  <div className="run-strip" aria-label="Recorded runs">
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
                    <div><dt>Duration</dt><dd>{selectedRecord.durationMs} ms</dd></div>
                    <div><dt>Exit code</dt><dd>{selectedRecord.exitCode ?? "none"}</dd></div>
                    <div><dt>Commit</dt><dd>{shortSha(selectedRecord.commitSha)}</dd></div>
                    <div><dt>Run ID</dt><dd>{selectedRecord.runId}</dd></div>
                  </dl>
                  <div className="output-excerpt">
                    <span>Bounded output</span>
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
                  <span>Act II · Surgeon</span>
                  <h2 id="surgeon-heading">Localise the first demonstrated bad commit.</h2>
                </div>
                <span className="terminal-state">Demonstrated range</span>
              </div>
              <div className="boundary-summary">
                <div><span>Last demonstrated good</span><code>{shortSha(data.boundary.goodCommit ?? "")}</code></div>
                <ArrowSquareOut aria-hidden="true" size={20} weight="regular" />
                <div><span>First demonstrated bad</span><code>{shortSha(data.boundary.badCommit ?? "")}</code></div>
              </div>
              <ol className="history-list">
                {data.history.map((entry) => (
                  <li className={`history-${entry.outcome.toLowerCase()}`} key={entry.commitSha}>
                    <span className="history-glyph">
                      {entry.outcome === "PASS" ? <CheckCircle aria-hidden="true" /> : <XCircle aria-hidden="true" />}
                    </span>
                    <a href={entry.url} rel="noreferrer" target="_blank">
                      <code>{shortSha(entry.commitSha)}</code>
                      <strong>{entry.title}</strong>
                    </a>
                    <span>{entry.date}</span>
                    <span>{entry.outcome === "PASS" ? "Clean" : "Signature matched"}</span>
                  </li>
                ))}
              </ol>
              <p className="case-note">The raw unbounded snapshot registration fetch appears in <code>{shortSha(data.boundary.badCommit ?? "")}</code>. Untested commits keep this result a range. Later sampled commits retain the same simulated signature.</p>
            </section>
          ) : null}

          {activePhase === "insurance" ? (
            <section className="case-phase" aria-labelledby="insurance-heading">
              <div className="phase-heading">
                <div>
                  <span>Act III · Insurance</span>
                  <h2 id="insurance-heading">Prove polarity, then stop at the write boundary.</h2>
                </div>
                <span className="approval-state"><LockKey aria-hidden="true" size={14} /> Approval required</span>
              </div>
              <div className="regression-proof">
                <div className="proof-row proof-clean">
                  <CheckCircle aria-hidden="true" size={20} />
                  <div><span>Last good commit</span><code>{shortSha(data.regression.good.commitSha)}</code></div>
                  <strong>PASS</strong>
                  <span>{data.regression.good.durationMs} ms</span>
                </div>
                <div className="proof-row proof-bad">
                  <XCircle aria-hidden="true" size={20} />
                  <div><span>First bad commit</span><code>{shortSha(data.regression.bad.commitSha)}</code></div>
                  <strong>FAIL MATCH</strong>
                  <span>{data.regression.bad.durationMs} ms</span>
                </div>
              </div>
              <div className="insurance-grid">
                <div className="publication-manifest">
                  <header><GitPullRequest aria-hidden="true" size={18} /><span>Draft PR manifest</span></header>
                  <dl>
                    <div><dt>Target</dt><dd>{data.publication.targetRepository}</dd></div>
                    <div><dt>Branch</dt><dd>{data.publication.branch}</dd></div>
                    <div><dt>Workflow</dt><dd>{data.publication.workflow}</dd></div>
                    <div><dt>Files</dt><dd>{data.publication.files.join(" · ")}</dd></div>
                  </dl>
                </div>
                <div className="approval-gate">
                  <LockKey aria-hidden="true" size={24} />
                  <h3>{approvalDecision === "denied" ? "Public write denied." : "Default decision: deny."}</h3>
                  <p>
                    {approvalDecision === "denied"
                      ? "Evidence remains available. No workflow was triggered and no GitHub mutation occurred."
                      : "TrueForge pauses on actions_run_trigger. A denial creates no branch, commit or pull request."}
                  </p>
                  <div className="approval-actions">
                    <button className="button button-secondary" onClick={() => setApprovalDecision("denied")} type="button">
                      Deny public write
                    </button>
                    <button className="button button-primary" disabled type="button">
                      Approve live write
                    </button>
                  </div>
                  <small>Live approval enables only when a local TrueForge session has a pending tool call.</small>
                </div>
              </div>
            </section>
          ) : null}

          {activePhase === "verdict" ? (
            <section className="case-phase" aria-labelledby="verdict-heading">
              <div className="phase-heading">
                <div>
                  <span>Evidence package</span>
                  <h2 id="verdict-heading">A conclusion with an audit trail.</h2>
                </div>
                <span className="terminal-state">Reproduction pinned</span>
              </div>
              <article className="verdict-document">
                <header>
                  <div><span>VERDICT / TF-417</span><strong>REPRODUCTION_PINNED</strong></div>
                  <Scales aria-hidden="true" size={32} weight="regular" />
                </header>
                <dl>
                  <div><dt>Observed</dt><dd>{data.selectedResult.matched}/{data.selectedResult.observed} valid runs</dd></div>
                  <div><dt>Condition</dt><dd>{selectedCondition.endpoint} / {selectedCondition.upstream}</dd></div>
                  <div><dt>Last demonstrated good</dt><dd>{shortSha(data.boundary.goodCommit ?? "")}</dd></div>
                  <div><dt>First demonstrated bad</dt><dd>{shortSha(data.boundary.badCommit ?? "")}</dd></div>
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
            onClick={() => setActivePhase(id)}
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
