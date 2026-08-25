"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AuthCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function AuthCard({ title, description, children, footer, className }: AuthCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? undefined : { opacity: 0, y: 14 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="w-full max-w-md"
    >
      <Card className={cn("glow-primary border-border/70", className)}>
        <CardHeader className="gap-1.5 pt-6 pb-2 text-left">
          <CardTitle className="font-heading text-2xl font-semibold">{title}</CardTitle>
          {description ? <CardDescription className="text-sm">{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="space-y-5 pb-6">{children}</CardContent>
      </Card>
      {footer ? <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div> : null}
    </motion.div>
  );
}
