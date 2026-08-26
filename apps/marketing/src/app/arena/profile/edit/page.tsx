"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Reveal } from "@/components/Reveal";
import { SectionHeading } from "@/components/SectionHeading";
import { Button } from "@/components/ui/button";
import { ApiError, arenaApi } from "@/lib/arenaApi";
import { useArenaAuth } from "@/lib/arenaAuthContext";
import { COUNTRIES } from "@/lib/countries";

const fieldClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none";

export default function ArenaEditProfilePage() {
  const router = useRouter();
  const { user, loading: authLoading, setUser } = useArenaAuth();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [country, setCountry] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/arena/auth/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setBio(user.bio ?? "");
    setCountry(user.country ?? "");
    setAvatarUrl(user.avatarUrl ?? "");
  }, [user]);

  if (authLoading || !user) return <p className="px-6 py-24 text-center text-sm text-slate-500">Loading…</p>;

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await arenaApi<{ user: typeof user }>("/api/arena/me", {
        method: "PUT",
        body: {
          name: name.trim(),
          bio: bio.trim(),
          country: country || undefined,
          ...(avatarUrl.trim() ? { avatarUrl: avatarUrl.trim() } : {}),
        },
      });
      setUser(res.user);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="px-6 py-20">
      <Reveal className="mx-auto max-w-xl">
        <SectionHeading eyebrow="Arena" title="Edit profile" tone="dark" subtitle={`@${user.handle}`} />

        <div className="mt-8 space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Display name</label>
            <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Bio</label>
            <textarea
              className={fieldClass}
              rows={4}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={2000}
              placeholder="Tell other competitors a bit about yourself."
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Country</label>
            <select className={fieldClass} value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">Not set</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Avatar URL</label>
            <input
              className={fieldClass}
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>

          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          {saved ? <p className="text-sm text-emerald-400">Profile updated.</p> : null}

          <div className="flex items-center gap-3 pt-2">
            <Button size="lg" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
            <Button href={`/arena/profile/${user.handle}`} variant="outline" size="lg">
              Back to profile
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
