"use client";

import { LockKeyhole } from "lucide-react";
import { motion } from "motion/react";

export function SecureModeActivation({
  showStatus = true,
}: {
  showStatus?: boolean;
}) {
  return (
    <>
      <motion.div
        animate={{ opacity: [0, 0.42, 0], top: ["0%", "100%"] }}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 z-20 h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent shadow-[0_0_18px_rgba(52,211,153,0.42)]"
        initial={{ opacity: 0, top: "0%" }}
        transition={{ duration: 0.9, ease: "easeInOut" }}
      />
      {showStatus && (
        <motion.div
          animate={{ opacity: 1, scale: 1, y: 0 }}
          aria-label="Session secured"
          className="pointer-events-none absolute left-1/2 top-14 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-400/20 bg-surface-1/85 py-1.5 pl-1.5 pr-3 text-xs shadow-[0_8px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl lg:top-4"
          data-testid="secure-activation-animation"
          initial={{ opacity: 0, scale: 0.88, y: -8 }}
          role="status"
          transition={{ duration: 0.38, ease: "easeOut" }}
        >
          <motion.span
            animate={{
              boxShadow: [
                "0 0 0 0 rgba(52,211,153,0.30)",
                "0 0 0 7px rgba(52,211,153,0)",
              ],
              scale: [0.88, 1.08, 1],
            }}
            className="grid h-6 w-6 place-items-center rounded-full bg-emerald-400/12 text-emerald-400"
            transition={{ duration: 0.62, ease: "easeOut" }}
          >
            <LockKeyhole className="h-3.5 w-3.5" />
          </motion.span>
          <span className="font-medium text-ink">Secured</span>
          <span className="h-1 w-1 rounded-full bg-emerald-400" />
          <span className="text-ink-tertiary">End-to-end encrypted</span>
        </motion.div>
      )}
    </>
  );
}
