"use client";
import { useEffect, useRef } from "react";
import type { TaskInput } from "@/lib/domain";
import { Icon } from "./pixels";
export type Config = { realAgentConfigured: boolean; model: string | null; ratesConfigured: boolean; executionMode: string; concurrency: number; authenticationEnabled: boolean; fixture: TaskInput };
const verdictClass = (s: string) => s === "completed" || s === "passed" ? "passed" : ["failed","budget_exceeded","awaiting_repair_approval"].includes(s) ? "failed" : ["blocked","cancelled"].includes(s) ? "blocked" : "unverified";
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  if (response.status === 401) throw new Error("Authentication required.");
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "Request failed."); return data as T;
}
export function Badge({ status, children }: { status: string; children?: React.ReactNode }) { return <span className={`badge ${verdictClass(status)}`}><span/>{children || status.replaceAll("_", " ")}</span>; }
export function Modal({ title, children, close, wide = false }: { title: string; children: React.ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); if (previous?.isConnected) previous.focus(); }; }, []);
  return <dialog ref={ref} className={`modal ${wide ? "wide" : ""}`} onCancel={close} aria-label={title}><div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={close}><Icon name="close"/></button></div>{children}</dialog>;
}
