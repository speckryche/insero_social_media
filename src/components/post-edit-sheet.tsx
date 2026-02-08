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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Post = any;

interface PostEditSheetProps {
  post: Post;
  onClose: () => void;
  onSave: (updated: Post) => void;
}

export function PostEditSheet({ post, onClose, onSave }: PostEditSheetProps) {
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
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkedin_content: linkedin,
          x_content: xContent,
          facebook_content: facebook,
          google_content: google,
          content_category: category,
          time_slot: timeSlot,
          has_image: hasImage,
          image_template_type: hasImage ? imageTemplate || null : null,
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
                    <SelectItem value="did_you_know">Did You Know</SelectItem>
                    <SelectItem value="savings_story">Savings Story</SelectItem>
                    <SelectItem value="industry_tip">Industry Tip</SelectItem>
                    <SelectItem value="myth_busting">Myth Busting</SelectItem>
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
                <Select value={imageTemplate} onValueChange={setImageTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select template type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stat_card">Stat Card</SelectItem>
                    <SelectItem value="tip_graphic">Tip Graphic</SelectItem>
                    <SelectItem value="quote_card">Quote Card</SelectItem>
                    <SelectItem value="comparison">Comparison</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* LinkedIn */}
            <div className="space-y-2">
              <Label>LinkedIn</Label>
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

            {/* Facebook */}
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

            {/* Google Business */}
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
