"use client";

import { useEffect, useState } from "react";
import { staffApi, ApiError, type StaffUser } from "@/lib/api";
import { Button, Card, ErrorNote, Field, Input } from "@/components/ui";
import { titleCase } from "@/lib/format";

export default function AccountPage() {
  const [user, setUser] = useState<StaffUser | null>(null);
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

  useEffect(() => {
    staffApi<{ user: StaffUser }>("/api/auth/me").then((d) => {
      setUser(d.user);
      setName(d.user.name);
      setEmail(d.user.email);
    });
  }, []);

  if (!user) return null;

  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase();

  async function saveProfile() {
    setProfileBusy(true);
    setProfileError(null);
    setProfileNotice(null);
    try {
      const body: Record<string, string> = {};
      if (name.trim() && name.trim() !== user!.name) body.name = name.trim();
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
      const d = await staffApi<{ user: StaffUser }>("/api/auth/me", { method: "PUT", body });
      setUser(d.user);
      setName(d.user.name);
      setEmail(d.user.email);
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
      await staffApi<{ user: StaffUser }>("/api/auth/me", {
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
          {titleCase(user.role)} · signed in as {user.email}
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
    </div>
  );
}
