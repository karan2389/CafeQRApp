"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CustomerFooter } from "@/components/customer/customer-footer";
import type { ReactNode } from "react";
import "@/app/table/[slug]/customer.css";

interface CustomerInfoPageProps {
  title: string;
  lastUpdated?: string;
  children: ReactNode;
}

export function CustomerInfoPage({ title, lastUpdated = "September 2026", children }: CustomerInfoPageProps) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <div className="courista courista-info-page">
      <header className="courista-info-header">
        <div className="courista-info-header-inner">
          <Link href="/" className="courista-brand" aria-label="Courista home">
            <span className="courista-brand-name">Courista</span>
            <span className="courista-brand-tag">EAT · PLAY · CONNECT</span>
          </Link>
          <button
            type="button"
            onClick={handleBack}
            className="courista-back-btn"
            aria-label="Return to previous page"
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
        </div>
      </header>

      <main className="courista-info-body">
        <h1>{title}</h1>
        <div className="courista-info-meta">Last updated: {lastUpdated}</div>
        <div className="courista-info-content">{children}</div>
      </main>

      <CustomerFooter />
    </div>
  );
}
