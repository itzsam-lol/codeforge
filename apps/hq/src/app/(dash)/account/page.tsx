"use client";

import { useEffect, useState } from "react";
import { hqApi, ApiError, type HqStaffUser } from "@/lib/api";
import { Badge, Button, Card, ErrorNote, Field, Input } from "@/components/ui";
import { deviceLabel, fmtDateTime, titleCase } from "@/lib/format";

interface Session {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  userAgent: string | null;
  ipAddress: string | null;
  isCurrent: boolean;
}

export default function AccountPage() {
  const [staff, setStaff] = useState<HqStaffUser | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessionsBusy, setSessionsBusy] = useState<string | null>(null); // session id, or "all"

  function loadSessions() {
    hqApi<{ sessions: Session[] }>("/api/auth/sessions")
      .then((d) => setSessions(d.sessions))
      .catch((err) => setSessionsError(err instanceof ApiError ? err.message : "Could not load sessions"));
  }

  const [twoFactorEnabled, setTwoFactorEnabled] = useState<boolean | null>(null);
  const [backupCodesRemaining, setBackupCodesRemaining] = useState(0);
  const [twoFactorStep, setTwoFactorStep] = useState<"idle" | "enrolling" | "backup-codes">("idle");
  const [enrollSecret, setEnrollSecret] = useState("");
  const [enrollQr, setEnrollQr] = useState("");
  const [enrollCode, setEnrollCode] = useState("");
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [newBackupCodes, setNewBackupCodes] = useState<string[]>([]);
  const [showDisable, setShowDisable] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableError, setDisableError] = useState<string | null>(null);
  const [disableBusy, setDisableBusy] = useState(false);

  function loadTwoFactorStatus() {
    hqApi<{ enabled: boolean; backupCodesRemaining: number }>("/api/auth/2fa/status")
      .then((d) => {
        setTwoFactorEnabled(d.enabled);
        setBackupCodesRemaining(d.backupCodesRemaining);
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    hqApi<{ staff: HqStaffUser }>("/api/auth/me").then((d) => {
      setStaff(d.staff);
      setName(d.staff.name);
      setEmail(d.staff.email);
    });
    loadSessions();
    loadTwoFactorStatus();
  }, []);

  async function startEnroll() {
    setEnrollBusy(true);
    setEnrollError(null);
    try {
      const d = await hqApi<{ secret: string; qrCodeDataUrl: string }>("/api/auth/2fa/enroll", { method: "POST" });
      setEnrollSecret(d.secret);
      setEnrollQr(d.qrCodeDataUrl);
      setTwoFactorStep("enrolling");
    } catch (err) {
      setEnrollError(err instanceof ApiError ? err.message : "Could not start enrollment");
    } finally {
      setEnrollBusy(false);
    }
  }

  async function confirmEnroll() {
    setEnrollBusy(true);
    setEnrollError(null);
    try {
      const d = await hqApi<{ backupCodes: string[] }>("/api/auth/2fa/confirm", {
        method: "POST",
        body: { code: enrollCode.trim() },
      });
      setNewBackupCodes(d.backupCodes);
      setTwoFactorStep("backup-codes");
      setEnrollCode("");
    } catch (err) {
      setEnrollError(err instanceof ApiError ? err.message : "Invalid code");
    } finally {
      setEnrollBusy(false);
    }
  }

  function finishEnroll() {
    setTwoFactorStep("idle");
    setNewBackupCodes([]);
    setEnrollSecret("");
    setEnrollQr("");
    loadTwoFactorStatus();
  }

  async function disableTwoFactor() {
    setDisableBusy(true);
    setDisableError(null);
    try {
      await hqApi("/api/auth/2fa/disable", { method: "POST", body: { currentPassword: disablePassword } });
      setDisablePassword("");
      setShowDisable(false);
      loadTwoFactorStatus();
    } catch (err) {
      setDisableError(err instanceof ApiError ? err.message : "Could not disable");
    } finally {
      setDisableBusy(false);
    }
  }

  async function revokeSession(id: string) {
    setSessionsBusy(id);
    try {
      await hqApi(`/api/auth/sessions/${id}`, { method: "DELETE" });
      loadSessions();
    } catch (err) {
      setSessionsError(err instanceof ApiError ? err.message : "Could not sign out that session");
    } finally {
      setSessionsBusy(null);
    }
  }

  async function revokeOtherSessions() {
    setSessionsBusy("all");
    try {
      await hqApi("/api/auth/sessions", { method: "DELETE" });
      loadSessions();
    } catch (err) {
      setSessionsError(err instanceof ApiError ? err.message : "Could not sign out other sessions");
    } finally {
      setSessionsBusy(null);
    }
  }

  if (!staff) return null;

  const emailChanged = email.trim().toLowerCase() !== staff.email.toLowerCase();

  async function saveProfile() {
    setProfileBusy(true);
    setProfileError(null);
    setProfileNotice(null);
    try {
      const body: Record<string, string> = {};
      if (name.trim() && name.trim() !== staff!.name) body.name = name.trim();
      if (emailChanged) {
        body.email = email.trim();
        if (!profilePassword) {
          setProfileError("Enter your current password to change your email");
          setProfileBusy(false);
          return;
        }
        body.currentPassword = profilePassword;
      }
      if (Object.keys(body).length === 0) {
        setProfileBusy(false);
        return;
      }
      const d = await hqApi<{ staff: HqStaffUser }>("/api/auth/me", { method: "PUT", body });
      setStaff(d.staff);
      setName(d.staff.name);
      setEmail(d.staff.email);
      setProfilePassword("");
      setProfileNotice("Saved.");
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setProfileBusy(false);
    }
  }

  async function savePassword() {
    setPasswordBusy(true);
    setPasswordError(null);
    setPasswordNotice(null);
    try {
      if (newPassword.length < 8) {
        setPasswordError("New password must be at least 8 characters");
        return;
      }
      if (newPassword !== confirmPassword) {
        setPasswordError("Passwords don't match");
        return;
      }
      await hqApi<{ staff: HqStaffUser }>("/api/auth/me", {
        method: "PUT",
        body: { currentPassword, newPassword },
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordNotice("Password changed. You've been signed out everywhere else.");
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">My account</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          {titleCase(staff.role)} · signed in as {staff.email}
        </p>
      </div>

      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold">Profile</h3>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </Field>
        <Field label="Email" hint="Changing this requires your current password">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={320} />
        </Field>
        {emailChanged ? (
          <Field label="Current password">
            <Input
              type="password"
              value={profilePassword}
              onChange={(e) => setProfilePassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
        ) : null}
        {profileError ? <ErrorNote message={profileError} /> : null}
        {profileNotice ? (
          <p className="rounded-lg bg-ok-bg px-3 py-2 text-xs text-ok">{profileNotice}</p>
        ) : null}
        <div className="flex justify-end">
          <Button onClick={saveProfile} disabled={profileBusy}>
            {profileBusy ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold">Password</h3>
        <Field label="Current password">
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <Field label="New password" hint="At least 8 characters">
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm new password">
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        {passwordError ? <ErrorNote message={passwordError} /> : null}
        {passwordNotice ? (
          <p className="rounded-lg bg-ok-bg px-3 py-2 text-xs text-ok">{passwordNotice}</p>
        ) : null}
        <div className="flex justify-end">
          <Button
            onClick={savePassword}
            disabled={passwordBusy || !currentPassword || !newPassword}
          >
            {passwordBusy ? "Changing…" : "Change password"}
          </Button>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Two-factor authentication</h3>
          {twoFactorEnabled !== null ? (
            <Badge color={twoFactorEnabled ? "ok" : "neutral"}>{twoFactorEnabled ? "Enabled" : "Not enabled"}</Badge>
          ) : null}
        </div>

        {twoFactorStep === "enrolling" ? (
          <div className="space-y-3">
            <p className="text-sm text-on-surface-variant">
              Scan this QR code with your authenticator app (Google Authenticator, 1Password, Authy, etc.), or enter
              the key manually.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrollQr} alt="2FA enrollment QR code" className="h-40 w-40" />
            <p className="break-all rounded-control bg-surface-container px-3 py-2 font-mono text-xs text-on-surface">
              {enrollSecret}
            </p>
            <Field label="Code from your app">
              <Input
                value={enrollCode}
                onChange={(e) => setEnrollCode(e.target.value)}
                placeholder="123456"
                autoComplete="one-time-code"
              />
            </Field>
            {enrollError ? <ErrorNote message={enrollError} /> : null}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setTwoFactorStep("idle");
                  setEnrollError(null);
                }}
                className="rounded-control px-3 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface"
              >
                Cancel
              </button>
              <Button onClick={confirmEnroll} disabled={enrollBusy || !enrollCode.trim()}>
                {enrollBusy ? "Verifying…" : "Confirm"}
              </Button>
            </div>
          </div>
        ) : twoFactorStep === "backup-codes" ? (
          <div className="space-y-3">
            <p className="text-sm text-on-surface-variant">
              Save these backup codes somewhere safe. Each one can be used once to sign in if you lose access to your
              authenticator app — they won&apos;t be shown again.
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-control bg-surface-container p-3 font-mono text-xs text-on-surface">
              {newBackupCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={finishEnroll}>I&apos;ve saved these codes</Button>
            </div>
          </div>
        ) : twoFactorEnabled ? (
          <div className="space-y-3">
            <p className="text-sm text-on-surface-variant">
              {backupCodesRemaining} backup {backupCodesRemaining === 1 ? "code" : "codes"} remaining.
            </p>
            {showDisable ? (
              <div className="space-y-3">
                <Field label="Current password">
                  <Input
                    type="password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </Field>
                {disableError ? <ErrorNote message={disableError} /> : null}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setShowDisable(false);
                      setDisablePassword("");
                      setDisableError(null);
                    }}
                    className="rounded-control px-3 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface"
                  >
                    Cancel
                  </button>
                  <Button onClick={disableTwoFactor} disabled={disableBusy || !disablePassword}>
                    {disableBusy ? "Disabling…" : "Disable 2FA"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end">
                <button onClick={() => setShowDisable(true)} className="text-xs font-medium text-on-surface-variant hover:text-rose-600">
                  Disable two-factor authentication
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-on-surface-variant">
              Add an extra step at sign-in using an authenticator app, so a leaked password alone can&apos;t be used
              to sign in as you.
            </p>
            {enrollError ? <ErrorNote message={enrollError} /> : null}
            <div className="flex justify-end">
              <Button onClick={startEnroll} disabled={enrollBusy}>
                {enrollBusy ? "Starting…" : "Enable 2FA"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Active sessions</h3>
          {sessions && sessions.length > 1 ? (
            <button
              onClick={revokeOtherSessions}
              disabled={sessionsBusy === "all"}
              className="text-xs font-medium text-on-surface-variant hover:text-rose-600"
            >
              {sessionsBusy === "all" ? "Signing out…" : "Sign out other sessions"}
            </button>
          ) : null}
        </div>
        {sessionsError ? <ErrorNote message={sessionsError} /> : null}
        {!sessions ? (
          <p className="text-sm text-on-surface-variant">Loading…</p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-control bg-surface-container p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-on-surface">
                    {deviceLabel(s.userAgent)}
                    {s.isCurrent ? (
                      <span className="rounded-full bg-ok-bg px-2 py-0.5 text-xs font-medium text-ok">This device</span>
                    ) : null}
                  </div>
                  <div className="text-xs text-on-surface-variant">
                    {s.ipAddress ?? "Unknown IP"} · last active {fmtDateTime(s.lastUsedAt)}
                  </div>
                </div>
                {!s.isCurrent ? (
                  <button
                    onClick={() => revokeSession(s.id)}
                    disabled={sessionsBusy === s.id}
                    className="shrink-0 text-xs font-medium text-on-surface-variant hover:text-rose-600"
                  >
                    {sessionsBusy === s.id ? "Signing out…" : "Sign out"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
