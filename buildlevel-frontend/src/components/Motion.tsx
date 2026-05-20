import { CSSProperties, ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

type ChildrenProps = {
  children: ReactNode;
};

export function PageTransition({ children }: ChildrenProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

type RevealProps = ChildrenProps & {
  delay?: number;
  className?: string;
  style?: CSSProperties;
};

export function Reveal({ children, delay = 0, className, style }: RevealProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 22, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: 0.62, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function AmbientBackground() {
  const reduceMotion = useReducedMotion();

  const glowAnimation = reduceMotion
    ? undefined
    : {
        x: [0, 24, -14, 0],
        y: [0, -18, 10, 0],
        scale: [1, 1.08, 0.96, 1],
      };

  const emberAnimation = reduceMotion
    ? undefined
    : {
        y: [0, -34, 0],
        opacity: [0.14, 0.34, 0.14],
      };

  return (
    <div className="ambient-bg" aria-hidden="true">
      <motion.span
        className="ambient-bg__glow ambient-bg__glow--red"
        animate={glowAnimation}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.span
        className="ambient-bg__glow ambient-bg__glow--gold"
        animate={glowAnimation}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 1.4 }}
      />
      <motion.span
        className="ambient-bg__ember ambient-bg__ember--one"
        animate={emberAnimation}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.span
        className="ambient-bg__ember ambient-bg__ember--two"
        animate={emberAnimation}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 1.8 }}
      />
      <motion.span
        className="ambient-bg__ember ambient-bg__ember--three"
        animate={emberAnimation}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
      />
    </div>
  );
}
