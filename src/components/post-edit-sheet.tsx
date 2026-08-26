"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DEFAULT_ENABLED_PLATFORMS,
  type Platform,
} from "@/lib/platforms";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Post = any;

interface PostEditSheetProps {
  post: Post;
  onClose: () => void;
  onSave: (updated: Post) => void;
  enabledPlatforms?: Platform[];
}

export function PostEditSheet({
  post,
  onClose,
  onSave,
  enabledPlatforms = DEFAULT_ENABLED_PLATFORMS,
}: PostEditSheetProps) {
  const [linkedinPersonal, setLinkedinPersonal] = useState(post.linkedin_personal_content || "");
  const [linkedin, setLinkedin] = useState(post.linkedin_content || "");
  const [xContent, setXContent] = useState(post.x_content || "");
  const [facebook, setFacebook] = useState(post.facebook_content || "");
  const [google, setGoogle] = useState(post.google_content || "");
  const [category, setCategory] = useState(post.content_category);
  const [timeSlot, setTimeSlot] = useState(post.time_slot);
  const [hasImage, setHasImage] = useState(post.has_image);
  const [imageTemplate, setImageTemplate] = useState(
    post.image_template_type || ""
  );
  const [imageHeadline, setImageHeadline] = useState(post.image_headline || "");
  const [imageBody, setImageBody] = useState(post.image_body || "");
  const [imageStatNumber, setImageStatNumber] = useState(post.image_stat_number || "");
  const [imageStatLabel, setImageStatLabel] = useState(post.image_stat_label || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkedin_personal_content: linkedinPersonal,
          linkedin_content: linkedin,
          x_content: xContent,
          facebook_content: facebook,
          google_content: google,
          content_category: category,
          time_slot: timeSlot,
          has_image: hasImage,
          image_template_type: hasImage ? imageTemplate || null : null,
          image_headline: hasImage ? imageHeadline || null : null,
          image_body: hasImage ? imageBody || null : null,
          image_stat_number: hasImage ? imageStatNumber || null : null,
          image_stat_label: hasImage ? imageStatLabel || null : null,
          status: "edited",
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        onSave(updated);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle>
            Edit Post #{post.post_number}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-140px)]">
          <div className="px-6 py-4 space-y-5">
            {/* Meta fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ai_speak">AI Speak</SelectItem>
                    <SelectItem value="tech_speak">Tech Speak</SelectItem>
                    <SelectItem value="quote_speak">Quote Speak</SelectItem>
                    <SelectItem value="cost_speak">Cost Speak</SelectItem>
                    <SelectItem value="pots_speak">POTS Speak</SelectItem>
                    <SelectItem value="personal_take">Personal Take</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Time Slot</Label>
                <Select value={timeSlot} onValueChange={setTimeSlot}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning">Morning</SelectItem>
                    <SelectItem value="afternoon">Afternoon</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Scheduled date (read-only display) */}
            <div className="space-y-2">
              <Label className="text-gray-500">Scheduled Date</Label>
              <p className="text-sm text-gray-700">
                {new Date(post.scheduled_date + "T00:00:00").toLocaleDateString(
                  "en-US",
                  { weekday: "long", month: "long", day: "numeric", year: "numeric" }
                )}
              </p>
            </div>

            {/* Image settings */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="has-image"
                  checked={hasImage}
                  onCheckedChange={(checked) => setHasImage(checked === true)}
                />
                <Label htmlFor="has-image">Has image</Label>
              </div>
              {hasImage && (
                <>
                  <Select value={imageTemplate} onValueChange={setImageTemplate}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select template type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stat_card">Stat Card</SelectItem>
                      <SelectItem value="tip_graphic">Tip Graphic</SelectItem>
                      <SelectItem value="quote_card">Quote Card</SelectItem>
                      <SelectItem value="comparison">Comparison</SelectItem>
                      <SelectItem value="savings_highlight">Savings Highlight</SelectItem>
                      <SelectItem value="myth_buster">Myth Buster</SelectItem>
                      <SelectItem value="did_you_know">Did You Know</SelectItem>
                      <SelectItem value="checklist">Checklist</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Image data fields */}
                  <div className="space-y-3 border rounded-lg p-3 bg-gray-50">
                    <Label className="text-xs text-gray-500 uppercase">Image Data</Label>
                    <div className="space-y-2">
                      <Label className="text-xs">Headline (max 8 words)</Label>
                      <Input
                        value={imageHeadline}
                        onChange={(e) => setImageHeadline(e.target.value)}
                        placeholder="e.g., 73% of businesses overpay"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Body (max 15 words)</Label>
                      <Input
                        value={imageBody}
                        onChange={(e) => setImageBody(e.target.value)}
                        placeholder="e.g., Most don't know until an audit reveals it"
                        className="text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs">Stat Number</Label>
                        <Input
                          value={imageStatNumber}
                          onChange={(e) => setImageStatNumber(e.target.value)}
                          placeholder="e.g., 73%"
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Stat Label</Label>
                        <Input
                          value={imageStatLabel}
                          onChange={(e) => setImageStatLabel(e.target.value)}
                          placeholder="e.g., of businesses"
                          className="text-sm"
                        />
                      </div>
                    </div>

                    {/* Image preview */}
                    {post.linkedin_image_url && (
                      <div className="mt-2">
                        <Label className="text-xs text-gray-500">Current Image</Label>
                        <img
                          src={post.linkedin_image_url}
                          alt="Current post image"
                          className="mt-1 w-full rounded border"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* LinkedIn Personal Profile */}
            <div className="space-y-2">
              <Label>LinkedIn Personal Profile</Label>
              <Textarea
                value={linkedinPersonal}
                onChange={(e) => setLinkedinPersonal(e.target.value)}
                rows={4}
                className="text-sm"
              />
              <p className="text-xs text-gray-400">
                {linkedinPersonal.length} characters
              </p>
            </div>

            {/* LinkedIn Company Page */}
            <div className="space-y-2">
              <Label>LinkedIn Company Page</Label>
              <Textarea
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
                rows={8}
                className="text-sm"
              />
              <p className="text-xs text-gray-400">
                {linkedin.length} characters
              </p>
            </div>

            {/* X (Twitter) */}
            {enabledPlatforms.includes("x") && (
            <div className="space-y-2">
              <Label>X (Twitter)</Label>
              <Textarea
                value={xContent}
                onChange={(e) => setXContent(e.target.value)}
                rows={3}
                className="text-sm"
              />
              <p
                className={`text-xs ${
                  xContent.length > 280 ? "text-red-500 font-medium" : "text-gray-400"
                }`}
              >
                {xContent.length}/280 characters
              </p>
            </div>
            )}

            {/* Facebook */}
            {enabledPlatforms.includes("facebook") && (
            <div className="space-y-2">
              <Label>Facebook</Label>
              <Textarea
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
                rows={6}
                className="text-sm"
              />
              <p className="text-xs text-gray-400">
                {facebook.length} characters
              </p>
            </div>
            )}

            {/* Google Business */}
            {enabledPlatforms.includes("google") && (
            <div className="space-y-2">
              <Label>Google Business Profile</Label>
              <Textarea
                value={google}
                onChange={(e) => setGoogle(e.target.value)}
                rows={5}
                className="text-sm"
              />
              <p className="text-xs text-gray-400">
                {google.length} characters
              </p>
            </div>
            )}
          </div>
        </ScrollArea>

        {/* Save / Cancel footer */}
        <div className="absolute bottom-0 left-0 right-0 border-t bg-white px-6 py-3 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            Save Changes
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
