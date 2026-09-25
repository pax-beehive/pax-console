"use client";

import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

export function SecureModeActivation({
  showStatus = true,
}: {
  showStatus?: boolean;
}) {
  const [visible, setVisible] = useState(true);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 2400);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <>
      {!reduceMotion && (
        <motion.div
          animate={{ opacity: [0, 0.42, 0], top: ["0%", "100%"] }}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-20 h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent shadow-[0_0_18px_rgba(52,211,153,0.42)]"
          initial={{ opacity: 0, top: "0%" }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
        />
      )}
      {showStatus && (
        <div
          aria-label="Encryption enabled"
          className="pointer-events-none absolute inset-x-4 top-28 z-20 mx-auto flex w-fit max-w-[calc(100%-32px)] items-center gap-3 rounded-2xl border border-emerald-400/20 bg-surface-2 px-4 py-3 text-sm font-medium leading-5 text-ink shadow-lg"
          data-testid="secure-activation-animation"
          role="status"
        >
          <LockKeyhole
            aria-hidden="true"
            className="h-5 w-5 shrink-0 text-emerald-400"
          />
          <span>End-to-end encryption enabled</span>
        </div>
      )}
    </>
  );
}
