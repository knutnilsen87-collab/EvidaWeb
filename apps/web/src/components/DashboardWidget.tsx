import { motion, useReducedMotion } from "framer-motion";
import { type PropsWithChildren } from "react";

interface DashboardWidgetProps extends PropsWithChildren {
  className?: string;
}

export function DashboardWidget({ children, className = "" }: DashboardWidgetProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.article
      className={`liquid-glass-panel widget ${className}`.trim()}
      whileHover={prefersReducedMotion ? undefined : { y: -4, scale: 1.01 }}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      {children}
    </motion.article>
  );
}
