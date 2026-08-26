import { ArrowUpRight, GithubLogo, LockKey, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { ExposurePreview } from "@/components/exposure-preview";
import { ThemeToggle } from "@/components/theme-toggle";

const investigationStages = [
  {
    act: "Act I",
    title: "Hunter",
    copy: "Search a bounded condition matrix and preserve every valid observation, including partial and unresolved outcomes.",
    output: "Pinned condition or honest partial",
  },
  {
    act: "Act II",
    title: "Surgeon",
    copy: "Start with a static-diff suspect range, then replay the pinned command across buildable history when execution is available.",
    output: "Suspect range or runtime boundary",
  },
  {
    act: "Act III",
    title: "Insurance",
    copy: "Define the regression test plan and require actual polarity evidence before any reviewed publication workflow can run.",
    output: "Test plan and gated handoff",
  },
];

function BrandMark() {
  return (
    <svg aria-hidden="true" className="brand-mark" viewBox="0 0 28 28">
      <rect height="22" width="22" x="3" y="3" />
      <path d="M8 14.5 12 19l8-10" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <nav aria-label="Primary" className="site-nav">
          <a className="brand" href="#top" aria-label="Verdict home">
            <BrandMark />
            <span>Verdict</span>
          </a>
          <div className="nav-links">
            <a href="#product">Product</a>
            <a href="#method">Method</a>
            <a href="#evidence">Evidence</a>
          </div>
          <div className="site-actions">
            <ThemeToggle />
            <a
              className="github-link"
              href="https://github.com/himanshu748/verdict"
              rel="noreferrer"
              target="_blank"
            >
              <GithubLogo aria-hidden="true" size={18} weight="regular" />
              <span>GitHub</span>
            </a>
          </div>
        </nav>
      </header>

      <main id="main-content">
        <section className="hero" id="top">
          <div className="hero-copy">
            <h1>
              <span>Bugs are innocent </span>
              <span>until reproduced.</span>
            </h1>
            <p>Verdict turns intermittent failures into bounded investigations, structured evidence and an approval-gated publication plan.</p>
            <div className="hero-actions">
              <a className="button button-primary" href="/case/demo">Inspect demo case</a>
              <a className="button button-secondary" href="#method">Read the method</a>
            </div>
            <dl className="hero-facts" aria-label="Demo case facts">
              <div><dt>Demo envelope</dt><dd>12 generated conditions</dd></div>
              <div><dt>Model threshold</dt><dd>10 generated records</dd></div>
              <div><dt>Demo public writes</dt><dd>0 performed</dd></div>
            </dl>
          </div>
          <div className="hero-product" id="product">
            <ExposurePreview />
          </div>
        </section>

        <section className="evidence-section" id="evidence">
          <div className="evidence-intro">
            <h2>Walk backward from every claim.</h2>
            <p>The protocol requires each live conclusion to resolve to structured records, the exact command and a captured environment.</p>
          </div>
          <div className="evidence-paper" aria-label="Example verdict record">
            <div className="paper-heading">
              <span>Verdict record</span>
              <span>Simulated fixture</span>
            </div>
            <dl>
              <div><dt>Outcome</dt><dd>SIMULATED_REPRODUCTION_PINNED</dd></div>
              <div><dt>Observed</dt><dd>10 / 10 generated records</dd></div>
              <div><dt>Condition</dt><dd><code>750 ms budget / no response</code></dd></div>
              <div><dt>Evidence</dt><dd>Schema-valid conceptual fixture</dd></div>
            </dl>
          </div>
        </section>

        <section className="method-section" id="method">
          <div className="method-heading">
            <h2>Three acts. One chain of proof.</h2>
            <p>Agents investigate. Deterministic reducers decide. The maintainer controls the only public write.</p>
          </div>
          <ol className="method-list">
            {investigationStages.map((stage) => (
              <li key={stage.title}>
                <div className="method-title">
                  <span>{stage.act}</span>
                  <h3>{stage.title}</h3>
                </div>
                <div>
                  <p>{stage.copy}</p>
                  <span className="method-output">Output: {stage.output}</span>
                </div>
                <ArrowUpRight aria-hidden="true" size={20} weight="regular" />
              </li>
            ))}
          </ol>
        </section>

        <section className="approval-section">
          <div className="approval-copy">
            <ShieldCheck aria-hidden="true" size={32} weight="regular" />
            <h2>The only write waits for you.</h2>
            <p>Denial preserves the evidence and produces zero GitHub mutations. Approval names the destination, files and workflow first.</p>
          </div>
          <div className="approval-manifest" aria-label="Publication manifest preview">
            <div className="manifest-title">
              <LockKey aria-hidden="true" size={18} weight="regular" />
              Review the public write
            </div>
            <dl>
              <div><dt>Repository</dt><dd>truefoundry/trueforge</dd></div>
              <div><dt>Proposed action</dt><dd>Exact workflow dispatch, disabled in demo</dd></div>
              <div><dt>Files</dt><dd>Proposed test, VERDICT.md, verdict.json</dd></div>
              <div><dt>Default</dt><dd>Stay read-only</dd></div>
            </dl>
          </div>
        </section>

        <section className="closing-section">
          <h2>Turn “sometimes” into a test case.</h2>
          <a className="button button-primary" href="/case/demo">
            Inspect the simulated case
          </a>
        </section>
      </main>

      <footer className="site-footer">
        <span>Verdict</span>
        <span>Evidence-first bug reproduction</span>
      </footer>
    </>
  );
}
