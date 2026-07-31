"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IconBook2,
  IconChartPie,
  IconMenu2,
  IconRefresh,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";

const navItems = [
  { href: "/", label: "概览", icon: IconChartPie },
  { href: "/content", label: "内容库", icon: IconBook2 },
  { href: "/weekly", label: "每周洞察", icon: IconSparkles },
  { href: "/sync", label: "同步记录", icon: IconRefresh },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/maintenance", { method: "POST", signal: controller.signal }).catch(
      () => undefined,
    );
    return () => controller.abort();
  }, []);

  return (
    <div className="app-shell">
      <button
        className="mobile-menu"
        type="button"
        aria-label={open ? "关闭导航" : "打开导航"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <IconX size={20} /> : <IconMenu2 size={20} />}
      </button>
      {open && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="关闭导航"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <Link href="/" className="brand" aria-label="Lenny Insight Hub 首页">
          <span className="brand-mark">L</span>
          <span>
            <strong>Lenny Insight</strong>
            <small>本地知识工作台</small>
          </span>
        </Link>
        <nav className="sidebar-nav" aria-label="主导航">
          <p className="nav-label">工作台</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${active ? "nav-item-active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <Icon size={19} stroke={1.8} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <span className="status-dot" />
          <div>
            <strong>数据仅保存在本机</strong>
            <small>SQLite · 个人学习使用</small>
          </div>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
