"use client";

import {
  CheckCircle,
  Circle,
  CircleNotch,
  WarningCircle,
  Waveform,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import {
  exposureStateLabel,
  sampleExposures,
  type Exposure,
  type ExposureState,
} from "@/lib/sample-case";
import { demoCase } from "@/lib/demo-case";

const iconByState: Record<ExposureState, typeof Circle> = {
  "not-reproduced": Circle,
  "weak-signal": Waveform,
  partial: Waveform,
  pinned: CheckCircle,
  running: CircleNotch,
  unresolved: WarningCircle,
};

function StateIcon({ state }: { state: ExposureState }) {
  const Icon = iconByState[state];
  return <Icon aria-hidden="true" size={15} weight="regular" />;
}

function FrameTexture({ exposure }: { exposure: Exposure }) {
  const seed = Number.parseInt(exposure.id, 10);
  const bars = Array.from(
    { length: 18 },
    (_, index) => 14 + ((seed * 23 + index * 17) % 72),
  );

  return (
    <span aria-hidden="true" className="exposure-texture">
      <span className="exposure-signal">
        {bars.map((height, index) => (
          <i key={`${exposure.id}-${index}`} style={{ height: `${height}%` }} />
        ))}
      </span>
    </span>
  );
}

export function ExposurePreview() {
  const reduceMotion = useReducedMotion();
  const [selectedId, setSelectedId] = useState(demoCase.selectedConditionId);
  const selected =
    sampleExposures.find((exposure) => exposure.id === selectedId) ?? sampleExposures[3]!;

  return (
    <section className="exposure-preview" aria-label="Interactive sample condition matrix">
      <div className="preview-heading">
        <span>Demo condition matrix (12)</span>
        <span>Generated fixture</span>
      </div>

      <div className="exposure-desktop">
        <div className="exposure-grid">
          {sampleExposures.map((exposure, index) => {
            const isSelected = exposure.id === selected.id;
            return (
              <motion.button
                aria-label={`Generated condition ${exposure.id}, ${exposureStateLabel[exposure.state]}, ${exposure.matched} of ${exposure.total} generated records matched`}
                aria-pressed={isSelected}
                className={`exposure-frame state-${exposure.state}`}
                initial={reduceMotion ? false : { opacity: 0.28 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: reduceMotion ? 0 : index * 0.035 }}
                key={exposure.id}
                onClick={() => setSelectedId(exposure.id)}
                type="button"
              >
                <FrameTexture exposure={exposure} />
                <span className="frame-topline">
                  <span>{exposure.id}</span>
                  <span>{exposure.matched}/{exposure.total}</span>
                </span>
                <span className="frame-bottomline">
                  <span>{exposure.environment}</span>
                  <span className="frame-state">
                    <StateIcon state={exposure.state} />
                    {exposureStateLabel[exposure.state]}
                  </span>
                </span>
                {isSelected ? <span aria-hidden="true" className="grease-circle" /> : null}
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="exposure-mobile">
        <div
          className={`mobile-selected state-${selected.state}`}
        >
          <FrameTexture exposure={selected} />
          <div className="mobile-selected-copy">
            <span>Selected condition {selected.id}</span>
            <strong>{exposureStateLabel[selected.state]}</strong>
            <code>{selected.environment}</code>
            <span>{selected.matched} of {selected.total} generated records</span>
          </div>
        </div>
        <div aria-label="Choose a condition" className="exposure-strip">
          {sampleExposures.map((exposure) => (
            <button
              aria-label={`Select condition ${exposure.id}`}
              aria-pressed={exposure.id === selected.id}
              className="strip-frame"
              key={exposure.id}
              onClick={() => setSelectedId(exposure.id)}
              type="button"
            >
              <FrameTexture exposure={exposure} />
              <span>{exposure.id}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="selected-evidence" aria-live="polite">
        <div>
          <span className="evidence-label">Selected condition</span>
          <strong>{selected.environment}</strong>
        </div>
        <div>
          <span className="evidence-label">Generated result</span>
          <strong>{selected.matched} of {selected.total} matched</strong>
        </div>
        <div>
          <span className="evidence-label">Proposed command / not run</span>
          <code>{selected.command}</code>
        </div>
      </div>
    </section>
  );
}
