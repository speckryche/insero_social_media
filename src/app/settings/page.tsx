"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Clock,
  Save,
  Loader2,
  CheckCircle2,
  Plug,
  FileText,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ALL_PLATFORMS,
  PLATFORM_LABELS,
  parseEnabledPlatforms,
  type Platform,
} from "@/lib/platforms";

interface ConnectionStatus {
  tested: boolean;
  loading: boolean;
  success: boolean | null;
  message: string | null;
}

const PLATFORMS = [
  { key: "linkedin", name: "LinkedIn" },
  { key: "x", name: "X (Twitter)" },
  { key: "facebook", name: "Facebook" },
  { key: "google", name: "Google Business Profile" },
];

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connStatuses, setConnStatuses] = useState<
    Record<string, ConnectionStatus>
  >({});

  // Form state
  const [weekdayMorning, setWeekdayMorning] = useState("08:00");
  const [weekdayAfternoon, setWeekdayAfternoon] = useState("13:00");
  const [weekendMorning, setWeekendMorning] = useState("09:00");
  const [weekendAfternoon, setWeekendAfternoon] = useState("15:00");
  const [postsPerDay, setPostsPerDay] = useState("2");
  const [contentNotes, setContentNotes] = useState("");
  const [bannedWords, setBannedWords] = useState("");
  const [speckIsms, setSpeckIsms] = useState("");
  const [styleSamples, setStyleSamples] = useState("");
  const [enabledPlatforms, setEnabledPlatforms] = useState<Platform[]>(["linkedin"]);
  const [linkedinAuthorType, setLinkedinAuthorType] = useState("organization");
  const [autoPublishPersonal, setAutoPublishPersonal] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          setWeekdayMorning(data.weekday_morning_time?.slice(0, 5) || "08:00");
          setWeekdayAfternoon(
            data.weekday_afternoon_time?.slice(0, 5) || "13:00"
          );
          setWeekendMorning(data.weekend_morning_time?.slice(0, 5) || "09:00");
          setWeekendAfternoon(
            data.weekend_afternoon_time?.slice(0, 5) || "15:00"
          );
          setPostsPerDay(String(data.posts_per_day || 2));
          setContentNotes(data.content_notes || "");
          setBannedWords(data.banned_words || "");
          setSpeckIsms(data.speck_isms || "");
          setStyleSamples(data.style_samples || "");
          setEnabledPlatforms(parseEnabledPlatforms(data.enabled_platforms));
          setLinkedinAuthorType(data.linkedin_author_type || "organization");
          setAutoPublishPersonal(data.auto_publish_personal || false);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekday_morning_time: weekdayMorning + ":00",
          weekday_afternoon_time: weekdayAfternoon + ":00",
          weekend_morning_time: weekendMorning + ":00",
          weekend_afternoon_time: weekendAfternoon + ":00",
          posts_per_day: parseInt(postsPerDay),
          content_notes: contentNotes,
          banned_words: bannedWords,
          speck_isms: speckIsms,
          style_samples: styleSamples,
          enabled_platforms: enabledPlatforms,
          linkedin_author_type: linkedinAuthorType,
          auto_publish_personal: autoPublishPersonal,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  }

  async function testConnection(platform: string) {
    setConnStatuses((prev) => ({
      ...prev,
      [platform]: {
        tested: false,
        loading: true,
        success: null,
        message: null,
      },
    }));
    try {
      const res = await fetch("/api/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      const data = await res.json();
      setConnStatuses((prev) => ({
        ...prev,
        [platform]: {
          tested: true,
          loading: false,
          success: data.success,
          message: data.message,
        },
      }));
    } catch {
      setConnStatuses((prev) => ({
        ...prev,
        [platform]: {
          tested: true,
          loading: false,
          success: false,
          message: "Connection test failed",
        },
      }));
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : saved ? (
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
          ) : (
            <Save className="h-4 w-4 mr-1.5" />
          )}
          {saved ? "Saved" : "Save Settings"}
        </Button>
      </div>

      {/* Posting Schedule */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-5 w-5 text-blue-600" />
            Posting Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Set when posts go out each day. Changes only affect future posts.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-gray-500 uppercase">
                Weekday Morning
              </Label>
              <Input
                type="time"
                value={weekdayMorning}
                onChange={(e) => setWeekdayMorning(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-gray-500 uppercase">
                Weekday Afternoon
              </Label>
              <Input
                type="time"
                value={weekdayAfternoon}
                onChange={(e) => setWeekdayAfternoon(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-gray-500 uppercase">
                Weekend Morning
              </Label>
              <Input
                type="time"
                value={weekendMorning}
                onChange={(e) => setWeekendMorning(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-gray-500 uppercase">
                Weekend Afternoon
              </Label>
              <Input
                type="time"
                value={weekendAfternoon}
                onChange={(e) => setWeekendAfternoon(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2 max-w-[200px]">
            <Label className="text-xs text-gray-500 uppercase">
              Posts Per Day
            </Label>
            <Select value={postsPerDay} onValueChange={setPostsPerDay}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 post/day</SelectItem>
                <SelectItem value="2">2 posts/day</SelectItem>
                <SelectItem value="3">3 posts/day</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Content Preferences */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-blue-600" />
            Content Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Additional Content Guidance</Label>
            <Textarea
              value={contentNotes}
              onChange={(e) => setContentNotes(e.target.value)}
              rows={4}
              placeholder='e.g., "Focus more on dental offices this month" or "Mention our new security service"'
              className="text-sm"
            />
            <p className="text-xs text-gray-400">
              These notes are included in the AI prompt when generating new
              batches.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Banned Words</Label>
            <Textarea
              value={bannedWords}
              onChange={(e) => setBannedWords(e.target.value)}
              rows={6}
              placeholder={"genuinely\nhonestly\nleverage"}
              className="text-sm font-mono"
            />
            <p className="text-xs text-gray-400">
              One word or phrase per line. Every post in every category is told
              never to use them.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Speck-isms</Label>
            <Textarea
              value={speckIsms}
              onChange={(e) => setSpeckIsms(e.target.value)}
              rows={6}
              placeholder={
                'gives nicknames to tools and people he likes ("my BFF Claude")\none exclamation point when something made his day'
              }
              className="text-sm"
            />
            <p className="text-xs text-gray-400">
              One habit per line. Used for Personal Take posts only, as habits
              of speech rather than lines to copy.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Style samples</Label>
            <Textarea
              value={styleSamples}
              onChange={(e) => setStyleSamples(e.target.value)}
              rows={6}
              placeholder="One post per line — real posts Speck wrote or rewrote himself."
              className="text-sm"
            />
            <p className="text-xs text-gray-400">
              One post per line. Shown to Personal Take generation as a rhythm
              and word-choice reference. &quot;Learn from my edits&quot; can add
              your edited posts here; the newest 40 are kept.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Enabled Platforms</Label>
            <p className="text-xs text-gray-400">
              Only these platforms are written, reviewed, and published.
              LinkedIn is always on.
            </p>
            <div className="grid gap-2 pt-1">
              {ALL_PLATFORMS.map((platform) => {
                const isLinkedIn = platform === "linkedin";
                const checked = enabledPlatforms.includes(platform);
                return (
                  <div key={platform} className="flex items-center space-x-2">
                    <Checkbox
                      id={`platform-${platform}`}
                      checked={checked}
                      disabled={isLinkedIn}
                      onCheckedChange={(value) => {
                        if (isLinkedIn) return;
                        setEnabledPlatforms((prev) =>
                          value === true
                            ? parseEnabledPlatforms([...prev, platform])
                            : parseEnabledPlatforms(
                                prev.filter((p) => p !== platform)
                              )
                        );
                      }}
                    />
                    <Label
                      htmlFor={`platform-${platform}`}
                      className={`text-sm font-normal ${
                        isLinkedIn ? "text-gray-500" : "cursor-pointer"
                      }`}
                    >
                      {PLATFORM_LABELS[platform]}
                      {isLinkedIn && (
                        <span className="text-xs text-gray-400"> — always on</span>
                      )}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 max-w-[250px]">
            <Label>LinkedIn Post As</Label>
            <Select
              value={linkedinAuthorType}
              onValueChange={setLinkedinAuthorType}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="organization">Company Page</SelectItem>
                <SelectItem value="person">Personal Profile</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm font-medium">Auto-Publish Personal Posts</Label>
              <p className="text-xs text-gray-400 mt-0.5">
                When enabled, approved personal LinkedIn posts are published automatically by the cron job.
                When disabled, use the &quot;Ready to Post&quot; page to manually copy and share them.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoPublishPersonal}
              onClick={() => setAutoPublishPersonal(!autoPublishPersonal)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                autoPublishPersonal ? "bg-blue-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                  autoPublishPersonal ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Platform Connections */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plug className="h-5 w-5 text-blue-600" />
              Platform Connections
            </CardTitle>
            <Link href="/settings/connections">
              <Button variant="ghost" size="sm" className="text-xs">
                Full Details
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {PLATFORMS.map((platform) => {
              const status = connStatuses[platform.key];
              return (
                <div
                  key={platform.key}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        status?.tested
                          ? status.success
                            ? "bg-green-500"
                            : "bg-red-500"
                          : "bg-gray-300"
                      }`}
                    />
                    <span className="text-sm font-medium text-gray-900">
                      {platform.name}
                    </span>
                    {status?.tested && (
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          status.success
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}
                      >
                        {status.success ? (
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                        ) : (
                          <XCircle className="h-3 w-3 mr-1" />
                        )}
                        {status.success ? "OK" : "Error"}
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => testConnection(platform.key)}
                    disabled={status?.loading}
                  >
                    {status?.loading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Test"
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
