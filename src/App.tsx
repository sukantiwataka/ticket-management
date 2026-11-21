import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDown, ArrowRight, ArrowUpRight, BadgeHelp, Bell, Check, ChevronDown, CircleHelp,
  Clock3, FilePlus2, Filter, LayoutDashboard, LogOut, MessageSquareText, RefreshCw, Search,
  Send, ShieldCheck, Sparkles, TicketCheck, Tickets, UserRound, X,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

type User = { email: string; name: string; pictureUrl?: string; role: "CUSTOMER" | "AGENT" | "ADMIN" };
type Ticket = {
  id: string; subject: string; description: string; category: string;
  status: string; priority: string; customerEmail: string; assigneeEmail?: string;
  createdAt: string; updatedAt: string;
};
type TicketMessage = {
  id: number; ticketId: string; authorEmail: string; authorName: string;
  authorRole: User["role"]; body: string; createdAt: string;
};
type Faq = { id: number; question: string; answer: string; category: string };
type Tab = "tickets" | "faqs" | "profile";

async function request<T>(path: string, csrf?: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  if (csrf) headers.set("X-XSRF-TOKEN", csrf);
  const response = await fetch(`${API}${path}`, { ...init, headers, credentials: "include" });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? body?.message ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const statusClass: Record<string, string> = {
  OPEN: "bg-sky-50 text-sky-700",
  IN_PROGRESS: "bg-violet-50 text-violet-700",
  WAITING_ON_CUSTOMER: "bg-amber-50 text-amber-700",
  RESOLVED: "bg-emerald-50 text-emerald-700",
  CLOSED: "bg-slate-100 text-slate-600",
};

function pretty(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [csrf, setCsrf] = useState("");
  const [tab, setTab] = useState<Tab>("tickets");
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [newTicket, setNewTicket] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [reply, setReply] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);

  const refreshTickets = async () => setTickets(await request<Ticket[]>("/api/tickets"));

  useEffect(() => {
    if (!user) return;
    const interval = window.setInterval(() => {
      void refreshTickets().catch((issue) => {
        setError(issue instanceof Error ? issue.message : "Tickets could not be refreshed.");
      });
    }, 15000);
    return () => window.clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (!selectedTicket) return;
    const interval = window.setInterval(() => {
      void request<TicketMessage[]>(`/api/tickets/${selectedTicket.id}/messages`)
        .then(setMessages)
        .catch((issue) => {
          setError(issue instanceof Error ? issue.message : "Conversation could not be refreshed.");
        });
    }, 10000);
    return () => window.clearInterval(interval);
  }, [selectedTicket]);

  useEffect(() => {
    const start = async () => {
      try {
        const token = await request<{ token: string }>("/api/auth/csrf");
        setCsrf(token.token);
        const profile = await request<User>("/api/auth/me");
        setUser(profile);
        setTickets(await request<Ticket[]>("/api/tickets"));
      } catch {
        setUser(null);
      } finally {
        try { setFaqs(await request<Faq[]>("/api/faqs")); } catch { setError("FAQs could not be loaded."); }
        setLoading(false);
      }
    };
    void start();
  }, []);

  const filteredTickets = useMemo(() => tickets.filter((ticket) => {
    const matchesStatus = filter === "ALL" || ticket.status === filter;
    const query = search.toLowerCase();
    const matchesText = !query || [ticket.id, ticket.subject, ticket.category, ticket.customerEmail]
      .some((value) => value.toLowerCase().includes(query));
    return matchesStatus && matchesText;
  }), [tickets, filter, search]);

  const openCount = tickets.filter((ticket) => ticket.status === "OPEN" || ticket.status === "IN_PROGRESS").length;
  const resolvedCount = tickets.filter((ticket) => ticket.status === "RESOLVED" || ticket.status === "CLOSED").length;

  async function submitTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setFormBusy(true);
    setError("");
    try {
      await request("/api/tickets", csrf, {
        method: "POST",
        body: JSON.stringify({
          subject: data.get("subject"),
          description: data.get("description"),
          category: data.get("category"),
          priority: data.get("priority"),
        }),
      });
      await refreshTickets();
      setNewTicket(false);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Ticket could not be created.");
    } finally {
      setFormBusy(false);
    }
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChatBusy(true);
    setAnswer("");
    try {
      const result = await request<{ answer: string }>("/api/faqs/ask", csrf, {
        method: "POST", body: JSON.stringify({ question }),
      });
      setAnswer(result.answer);
    } catch (issue) {
      setAnswer(issue instanceof Error ? issue.message : "The assistant is unavailable.");
    } finally {
      setChatBusy(false);
    }
  }

  async function updateStatus(ticket: Ticket, status: string) {
    try {
      await request(`/api/tickets/${ticket.id}/status`, csrf, {
        method: "PATCH", body: JSON.stringify({ status }),
      });
      await refreshTickets();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Ticket update failed.");
    }
  }

  async function claimTicket(ticket: Ticket) {
    if (!user) return;
    try {
      await request(`/api/tickets/${ticket.id}/assign`, csrf, {
        method: "POST", body: JSON.stringify({ assigneeEmail: user.email }),
      });
      await refreshTickets();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Ticket could not be assigned.");
    }
  }

  async function openConversation(ticket: Ticket) {
    setSelectedTicket(ticket);
    setMessages([]);
    setReply("");
    try {
      setMessages(await request<TicketMessage[]>(`/api/tickets/${ticket.id}/messages`));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Conversation could not be loaded.");
    }
  }

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTicket) return;
    setReplyBusy(true);
    setError("");
    try {
      await request<TicketMessage>(`/api/tickets/${selectedTicket.id}/messages`, csrf, {
        method: "POST",
        body: JSON.stringify({ body: reply }),
      });
      setReply("");
      setMessages(await request<TicketMessage[]>(`/api/tickets/${selectedTicket.id}/messages`));
      await refreshTickets();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Reply could not be sent.");
    } finally {
      setReplyBusy(false);
    }
  }

  async function signOut() {
    try {
      await request("/api/auth/logout", csrf, { method: "POST" });
    } finally {
      setUser(null);
      setTickets([]);
    }
  }

  if (loading) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading your workspace…</div>;
  if (!user) {
    return (
      <main className="login-bg grid min-h-screen place-items-center p-5">
        <section className="w-full max-w-md rounded-3xl border border-white/80 bg-white p-9 shadow-xl shadow-indigo-950/10">
          <div className="mb-9 flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-indigo-600 text-white"><TicketCheck size={23} /></div>
            <div><p className="font-bold tracking-tight text-slate-900">orbit<span className="text-indigo-600">support</span></p><p className="text-xs text-slate-500">Customer care, in one place</p></div>
          </div>
          <div className="mb-8">
            <p className="mb-2 text-sm font-semibold text-indigo-600">WELCOME TO YOUR SUPPORT HUB</p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Let’s get things<br />sorted out.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">Sign in to track requests, get help, and stay in the loop.</p>
          </div>
          {error && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          <button onClick={() => { window.location.href = `${API}/oauth2/authorization/google`; }}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            <GoogleMark /> Continue with Google <ArrowRight size={16} />
          </button>
          <p className="mt-6 text-center text-xs text-slate-400">Secure sign-in powered by Google authentication</p>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f8fc] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-5 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-indigo-600 text-white"><TicketCheck size={21} /></div>
            <div><div className="font-bold tracking-tight">orbit<span className="text-indigo-600">support</span></div><div className="text-[11px] text-slate-400">CUSTOMER CARE PORTAL</div></div>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            <NavButton active={tab === "tickets"} icon={<Tickets size={16} />} onClick={() => setTab("tickets")}>{user.role === "CUSTOMER" ? "My tickets" : "Support inbox"}</NavButton>
            <NavButton active={tab === "faqs"} icon={<CircleHelp size={16} />} onClick={() => setTab("faqs")}>Help center</NavButton>
            <NavButton active={tab === "profile"} icon={<UserRound size={16} />} onClick={() => setTab("profile")}>My profile</NavButton>
          </nav>
          <div className="flex items-center gap-3">
            <button aria-label="Notifications" className="relative rounded-xl p-2 text-slate-500 hover:bg-slate-100"><Bell size={18} /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-indigo-500" /></button>
            <div className="hidden items-center gap-2 sm:flex">
              {user.pictureUrl ? <img src={user.pictureUrl} className="size-9 rounded-full object-cover" /> : <div className="grid size-9 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">{user.name[0]}</div>}
              <div className="max-w-36"><p className="truncate text-sm font-semibold">{user.name}</p><p className="text-[11px] text-slate-400">{pretty(user.role)}</p></div>
              <button onClick={signOut} title="Sign out" className="ml-1 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><LogOut size={16} /></button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-5 py-8 lg:px-10 lg:py-10">
        {error && <div className="mb-5 flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button onClick={() => setError("")}><X size={16} /></button></div>}
        {tab === "tickets" && <>
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div><div className="mb-2 flex items-center gap-2 text-sm text-slate-500"><LayoutDashboard size={15} /> Workspace <span>/</span> {user.role === "CUSTOMER" ? "My tickets" : "Support inbox"}</div><h1 className="text-3xl font-semibold tracking-tight">{user.role === "CUSTOMER" ? `Good ${new Date().getHours() < 12 ? "morning" : "afternoon"}, ${user.name.split(" ")[0]}` : user.role === "ADMIN" ? "Administrator inbox" : "Agent work queue"} <span className="text-2xl">✦</span></h1><p className="mt-2 text-sm text-slate-500">{user.role === "CUSTOMER" ? "Here’s what’s happening with your support requests." : "Review incoming requests, reply to customers, and keep ticket statuses up to date."}</p></div>
            {user.role === "CUSTOMER" && <button onClick={() => setNewTicket(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-200 hover:bg-indigo-700"><FilePlus2 size={17} /> Create a ticket</button>}
          </div>
          <div className="mb-7 grid gap-4 sm:grid-cols-3">
            <Stat icon={<Tickets size={18} />} label="Total tickets" value={tickets.length} tone="indigo" foot="All requests in your account" />
            <Stat icon={<Clock3 size={18} />} label="Needs attention" value={openCount} tone="amber" foot="Open or being worked on" />
            <Stat icon={<Check size={18} />} label="Resolved" value={resolvedCount} tone="green" foot="Successfully completed" />
          </div>
          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div><h2 className="font-semibold">{user.role === "CUSTOMER" ? "Your support tickets" : user.role === "ADMIN" ? "All customer tickets" : "Available and assigned tickets"}</h2><p className="mt-1 text-xs text-slate-400">{user.role === "CUSTOMER" ? "A complete history of your requests" : "New requests refresh automatically every 15 seconds"}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => void refreshTickets().catch((issue) => setError(issue instanceof Error ? issue.message : "Tickets could not be refreshed."))} aria-label="Refresh tickets" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><RefreshCw size={15} /></button>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"><Search size={15} className="text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tickets" className="w-32 text-xs outline-none placeholder:text-slate-400 sm:w-40" /></label>
                <div className="relative"><Filter size={14} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" /><select value={filter} onChange={(event) => setFilter(event.target.value)} className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-8 text-xs text-slate-600 outline-none"><option value="ALL">All status</option>{["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"].map((item) => <option key={item} value={item}>{pretty(item)}</option>)}</select><ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-2.5 text-slate-400" /></div>
              </div>
            </div>
            {filteredTickets.length ? <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50/80 text-[11px] uppercase tracking-wide text-slate-400"><tr><th className="px-6 py-3 font-medium">Ticket</th><th className="px-5 py-3 font-medium">Category</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Priority</th><th className="px-5 py-3 font-medium">Created</th><th className="px-5 py-3 font-medium">Conversation</th>{user.role !== "CUSTOMER" && <th className="px-5 py-3 font-medium">Staff actions</th>}</tr></thead><tbody className="divide-y divide-slate-100">{filteredTickets.map((ticket) => <tr key={ticket.id} className="transition hover:bg-slate-50/70"><td className="px-6 py-4"><p className="font-semibold text-slate-800">{ticket.subject}</p><p className="mt-1 text-xs text-slate-400">{ticket.id}{user.role !== "CUSTOMER" ? ` · ${ticket.customerEmail}` : ""}</p>{ticket.assigneeEmail && <p className="mt-1 text-[11px] text-slate-400">Assigned: {ticket.assigneeEmail}</p>}</td><td className="px-5 py-4 text-slate-600">{pretty(ticket.category)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass[ticket.status] ?? statusClass.OPEN}`}>{pretty(ticket.status)}</span></td><td className="px-5 py-4"><Priority value={ticket.priority} /></td><td className="px-5 py-4 text-xs text-slate-500">{new Date(ticket.createdAt).toLocaleDateString()}</td><td className="px-5 py-4"><button onClick={() => void openConversation(ticket)} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"><MessageSquareText size={14} /> Open conversation</button></td>{user.role !== "CUSTOMER" && <td className="px-5 py-4"><div className="flex items-center gap-2"><select aria-label={`Update ${ticket.id}`} value={ticket.status} onChange={(event) => void updateStatus(ticket, event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="WAITING_ON_CUSTOMER">Waiting on customer</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option></select>{user.role === "AGENT" && !ticket.assigneeEmail && <button onClick={() => void claimTicket(ticket)} className="rounded-lg bg-indigo-50 px-2 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">Claim</button>}</div></td>}</tr>)}</tbody></table></div> : <div className="grid justify-items-center px-6 py-16 text-center"><div className="mb-4 grid size-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-500"><MessageSquareText size={22} /></div><h3 className="font-semibold">{search || filter !== "ALL" ? "No matching tickets" : user.role === "CUSTOMER" ? "No tickets yet" : "Inbox is clear"}</h3><p className="mt-1 max-w-sm text-sm text-slate-500">{search || filter !== "ALL" ? "Try changing the search or status filter." : user.role === "CUSTOMER" ? "When you create a support request, it will appear here." : "New customer requests will appear here automatically."}</p>{user.role === "CUSTOMER" && <button onClick={() => setNewTicket(true)} className="mt-4 text-sm font-semibold text-indigo-600 hover:text-indigo-700">Create your first ticket <ArrowRight className="ml-1 inline" size={15} /></button>}</div>}
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3 text-xs text-slate-400"><span>Showing {filteredTickets.length} of {tickets.length} tickets</span><span>Updated just now</span></div>
          </section>
          <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-white p-5 sm:px-7"><div className="flex items-center gap-4"><div className="grid size-11 place-items-center rounded-xl bg-white text-indigo-600 shadow-sm"><Sparkles size={20} /></div><div><h3 className="font-semibold">Need a quick answer?</h3><p className="mt-1 text-sm text-slate-500">Our help center might have just what you need.</p></div></div><button onClick={() => setTab("faqs")} className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3.5 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">Visit help center <ArrowUpRight size={15} /></button></section>
        </>}

        {tab === "faqs" && <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
          <section><p className="mb-2 text-sm font-semibold text-indigo-600">HELP CENTER</p><h1 className="text-3xl font-semibold tracking-tight">How can we help?</h1><p className="mt-2 text-sm text-slate-500">Browse answers or ask our AI-powered support assistant.</p>
            <label className="mt-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><Search size={18} className="text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search help articles..." className="w-full text-sm outline-none placeholder:text-slate-400" /></label>
            <div className="mt-5 space-y-3">{faqs.filter((faq) => !search || `${faq.question} ${faq.answer} ${faq.category}`.toLowerCase().includes(search.toLowerCase())).map((faq) => <details key={faq.id} className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-slate-800"><span>{faq.question}</span><ChevronDown size={17} className="shrink-0 text-slate-400 transition group-open:rotate-180" /></summary><p className="mt-3 border-t border-slate-100 pt-3 text-sm leading-6 text-slate-600">{faq.answer}</p><span className="mt-3 inline-block rounded-md bg-indigo-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">{faq.category}</span></details>)}</div>
          </section>
          <section className="h-fit overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center gap-3 bg-indigo-600 px-5 py-5 text-white"><div className="grid size-10 place-items-center rounded-xl bg-white/15"><Sparkles size={19} /></div><div><h2 className="font-semibold">Ask Orbit AI</h2><p className="text-xs text-indigo-100">Answers grounded in our help articles</p></div><span className="ml-auto rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold">AI ASSISTANT</span></div><div className="min-h-48 bg-slate-50/70 p-5"><div className="max-w-sm rounded-2xl rounded-tl-md border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600 shadow-sm"><p className="mb-2 flex items-center gap-2 font-semibold text-slate-800"><BadgeHelp size={16} className="text-indigo-500" /> Hi {user.name.split(" ")[0]}!</p>Ask me anything about your account or support. I’ll find the best answer for you.</div>{answer && <div className="ml-auto mt-4 max-w-sm rounded-2xl rounded-tr-md bg-indigo-600 p-4 text-sm leading-6 text-white shadow-sm">{answer}</div>}{chatBusy && <p className="mt-4 text-xs text-slate-400">Finding an answer…</p>}</div><form onSubmit={submitQuestion} className="flex gap-2 border-t border-slate-100 p-4"><input required maxLength={2000} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Type your question..." className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" /><button disabled={chatBusy} aria-label="Send question" className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"><Send size={17} /></button></form></section>
        </div>}

        {tab === "profile" && <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><p className="text-sm font-semibold text-indigo-600">ACCOUNT</p><h1 className="mt-2 text-3xl font-semibold">Your profile</h1><p className="mt-2 text-sm text-slate-500">Your account is securely managed through Google.</p><div className="mt-7 flex items-center gap-4 border-b border-slate-100 pb-6">{user.pictureUrl ? <img src={user.pictureUrl} className="size-16 rounded-full object-cover" /> : <div className="grid size-16 place-items-center rounded-full bg-indigo-100 text-xl font-semibold text-indigo-700">{user.name[0]}</div>}<div><p className="text-lg font-semibold">{user.name}</p><p className="text-sm text-slate-500">{user.email}</p></div></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><ProfileItem label="Account type" value={pretty(user.role)} /><ProfileItem label="Sign-in method" value="Google account" /><ProfileItem label="My tickets" value={String(tickets.length)} /><ProfileItem label="Resolved requests" value={String(resolvedCount)} /></div><div className="mt-6 flex gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"><ShieldCheck size={19} className="shrink-0" /><p>Your account is protected with secure Google authentication. Your ticket history is only visible to you and authorized support staff.</p></div></section>}
      </main>

      {selectedTicket && <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedTicket(null); }}><section className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-100 p-5 sm:p-6"><div><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{selectedTicket.id} · {pretty(selectedTicket.status)}</p><h2 className="mt-1 text-xl font-semibold">{selectedTicket.subject}</h2><p className="mt-1 text-xs text-slate-500">{user.role === "CUSTOMER" ? "Support conversation" : `Customer: ${selectedTicket.customerEmail}`}</p></div><button onClick={() => setSelectedTicket(null)} aria-label="Close conversation" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div><div className="space-y-4 overflow-y-auto bg-slate-50/70 p-5 sm:p-6"><article className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex justify-between gap-3 text-xs"><span className="font-semibold">{user.role === "CUSTOMER" ? "You" : selectedTicket.customerEmail} · Ticket description</span><time className="shrink-0 text-slate-400">{new Date(selectedTicket.createdAt).toLocaleString()}</time></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedTicket.description}</p></article>{messages.map((message) => <article key={message.id} className={`rounded-xl border p-4 ${message.authorRole === "CUSTOMER" ? "border-slate-200 bg-white" : "border-indigo-100 bg-indigo-50"}`}><div className="flex flex-wrap justify-between gap-2 text-xs"><span className="font-semibold">{message.authorName} <span className="font-normal text-slate-500">· {pretty(message.authorRole)}</span></span><time className="text-slate-400">{new Date(message.createdAt).toLocaleString()}</time></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{message.body}</p></article>)}{messages.length === 0 && <p className="text-center text-xs text-slate-400">No replies yet. Send a reply to start the conversation.</p>}</div><form onSubmit={submitReply} className="border-t border-slate-100 p-4 sm:p-5"><label className="sr-only" htmlFor="ticket-reply">Write a reply</label><textarea id="ticket-reply" required maxLength={10000} rows={3} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a reply to this ticket…" className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" /><div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-slate-400">{user.role === "AGENT" && !selectedTicket.assigneeEmail ? "Claim this ticket before replying." : "Replies are visible to the customer and support staff."}</p><button disabled={replyBusy || (user.role === "AGENT" && !selectedTicket.assigneeEmail)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"><Send size={15} />{replyBusy ? "Sending…" : "Send reply"}</button></div></form></section></div>}
      {newTicket && <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setNewTicket(false); }}><section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><p className="text-sm font-semibold text-indigo-600">NEW SUPPORT REQUEST</p><h2 className="mt-1 text-xl font-semibold">Tell us what’s going on</h2></div><button onClick={() => setNewTicket(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div><form onSubmit={submitTicket} className="space-y-4"><label className="block text-sm font-medium">Subject<input required maxLength={200} name="subject" placeholder="A short summary of the issue" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Category<select name="category" className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="GENERAL">General</option><option value="BILLING">Billing</option><option value="TECHNICAL">Technical</option><option value="ACCOUNT">Account</option></select></label><label className="block text-sm font-medium">Priority<select name="priority" className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="MEDIUM">Medium</option><option value="LOW">Low</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label></div><label className="block text-sm font-medium">Description<textarea required maxLength={10000} name="description" rows={5} placeholder="Share any details that will help us resolve this..." className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400" /></label><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setNewTicket(false)} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button><button disabled={formBusy} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{formBusy ? "Submitting…" : "Submit ticket"}</button></div></form></section></div>}
    </div>
  );
}

function GoogleMark() {
  return <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" transform="translate(0 5)" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94a11.05 11.05 0 0 1-4.8 7.24l7.73 5.99c4.51-4.17 7.11-10.31 7.11-17.7Z" /><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.9 23.9 0 0 0 0 21.56l7.98-6.19Z" transform="translate(0 5)" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.73-5.99c-2.15 1.45-4.92 2.3-8.17 2.3-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" /></svg>;
}

function NavButton({ active, icon, onClick, children }: { active: boolean; icon: ReactNode; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>{icon}{children}</button>;
}

function Stat({ icon, label, value, tone, foot }: { icon: ReactNode; label: string; value: number; tone: string; foot: string }) {
  const colors: Record<string, string> = { indigo: "bg-indigo-50 text-indigo-600", amber: "bg-amber-50 text-amber-600", green: "bg-emerald-50 text-emerald-600" };
  return <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm text-slate-500">{label}</span><span className={`grid size-9 place-items-center rounded-xl ${colors[tone]}`}>{icon}</span></div><div className="mt-3 text-3xl font-semibold tracking-tight">{value}</div><p className="mt-1 text-xs text-slate-400">{foot}</p></div>;
}

function Priority({ value }: { value: string }) {
  const Icon = value === "URGENT" || value === "HIGH" ? ArrowUpRight : value === "LOW" ? ArrowDown : Clock3;
  const color = value === "URGENT" || value === "HIGH" ? "text-rose-600" : value === "LOW" ? "text-slate-400" : "text-amber-600";
  return <span className={`inline-flex items-center gap-1 text-xs ${color}`}><Icon size={14} />{pretty(value)}</span>;
}

function ProfileItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 font-medium">{value}</p></div>;
}

export default App;
