"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEFAULT_ENABLED_PLATFORMS,
  OPTIONAL_PLATFORMS,
  type Platform,
} from "@/lib/platforms";
import { ScrollArea } from "@/components/ui/scroll-area";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Post = any;

interface PostPreviewModalProps {
  post: Post;
  onClose: () => void;
  enabledPlatforms?: Platform[];
  /** Show one scope only, with no tabs. Omit for the full tabbed preview. */
  scope?: "company" | "personal";
}

export function PostPreviewModal({
  post,
  onClose,
  enabledPlatforms = DEFAULT_ENABLED_PLATFORMS,
  scope,
}: PostPreviewModalProps) {
  // Personal + Company are always shown; the rest follow the toggle.
  const extraPlatforms = OPTIONAL_PLATFORMS.filter((p) =>
    enabledPlatforms.includes(p)
  );
  // Opened from a scope panel: one card, no tab strip.
  if (scope) {
    const isCompany = scope === "company";
    return (
      <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Preview Post #{post.post_number} — {isCompany ? "Company" : "Personal"}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[50vh] mt-3">
            <div className="bg-white border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                    isCompany ? "bg-[#1B2A4A]" : "bg-gray-600"
                  }`}
                >
                  {isCompany ? "I" : "P"}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {isCompany ? "Insero" : "Personal Profile"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {isCompany
                      ? "Technology. Simplified."
                      : "Telecom Consultant at Insero"}
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">
                {(isCompany
                  ? post.linkedin_content
                  : post.linkedin_personal_content) || "No personal content"}
              </p>
              {(isCompany
                ? post.linkedin_image_url
                : post.linkedin_personal_image_url) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={
                    isCompany
                      ? post.linkedin_image_url
                      : post.linkedin_personal_image_url
                  }
                  alt="Post image"
                  className="w-full rounded border"
                />
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Preview Post #{post.post_number}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="linkedin-personal" className="w-full">
          <TabsList
            className="grid w-full h-9"
            style={{
              gridTemplateColumns: `repeat(${2 + extraPlatforms.length}, minmax(0, 1fr))`,
            }}
          >
            <TabsTrigger value="linkedin-personal" className="text-xs">Personal</TabsTrigger>
            <TabsTrigger value="linkedin-company" className="text-xs">Company</TabsTrigger>
            {extraPlatforms.includes("x") && (
              <TabsTrigger value="x" className="text-xs">X</TabsTrigger>
            )}
            {extraPlatforms.includes("facebook") && (
              <TabsTrigger value="facebook" className="text-xs">Facebook</TabsTrigger>
            )}
            {extraPlatforms.includes("google") && (
              <TabsTrigger value="google" className="text-xs">Google</TabsTrigger>
            )}
          </TabsList>

          <ScrollArea className="h-[50vh] mt-3">
            <TabsContent value="linkedin-personal" className="mt-0">
              <div className="bg-white border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs font-bold">
                    P
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Personal Profile</p>
                    <p className="text-xs text-gray-500">Telecom Consultant at Insero</p>
                  </div>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">
                  {post.linkedin_personal_content || "No personal content"}
                </p>
                {post.linkedin_personal_image_url && (
                  <img
                    src={post.linkedin_personal_image_url}
                    alt="Post image"
                    className="w-full rounded border"
                  />
                )}
              </div>
            </TabsContent>

            <TabsContent value="linkedin-company" className="mt-0">
              <div className="bg-white border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#1B2A4A] flex items-center justify-center text-white text-xs font-bold">
                    I
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Insero</p>
                    <p className="text-xs text-gray-500">Technology. Simplified.</p>
                  </div>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">
                  {post.linkedin_content}
                </p>
                {post.linkedin_image_url && (
                  <img
                    src={post.linkedin_image_url}
                    alt="Post image"
                    className="w-full rounded border"
                  />
                )}
              </div>
            </TabsContent>

            {extraPlatforms.includes("x") && (
            <TabsContent value="x" className="mt-0">
              <div className="bg-white border rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#1B2A4A] flex items-center justify-center text-white text-xs font-bold">
                    I
                  </div>
                  <div>
                    <span className="text-sm font-bold text-gray-900">Insero</span>
                    <span className="text-sm text-gray-500 ml-1">@inserocloud</span>
                  </div>
                </div>
                <p className="text-[15px] text-gray-900 leading-snug">
                  {post.x_content}
                </p>
                {post.x_image_url && (
                  <img
                    src={post.x_image_url}
                    alt="Post image"
                    className="w-full rounded-xl border"
                  />
                )}
                <div className="flex items-center justify-between pt-2 border-t text-xs text-gray-500">
                  <span
                    className={
                      (post.x_content?.length || 0) > 280
                        ? "text-red-500 font-medium"
                        : ""
                    }
                  >
                    {post.x_content?.length || 0}/280
                  </span>
                </div>
              </div>
            </TabsContent>
            )}

            {extraPlatforms.includes("facebook") && (
            <TabsContent value="facebook" className="mt-0">
              <div className="bg-white border rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 border-b">
                  <div className="w-9 h-9 rounded-full bg-[#1B2A4A] flex items-center justify-center text-white text-xs font-bold">
                    I
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Insero</p>
                    <p className="text-xs text-gray-500">Just now</p>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-sm text-gray-800 whitespace-pre-line">
                    {post.facebook_content}
                  </p>
                  {post.facebook_image_url && (
                    <img
                      src={post.facebook_image_url}
                      alt="Post image"
                      className="w-full rounded border mt-3"
                    />
                  )}
                </div>
              </div>
            </TabsContent>
            )}

            {extraPlatforms.includes("google") && (
            <TabsContent value="google" className="mt-0">
              <div className="bg-white border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                    G
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      Insero - Google Business
                    </p>
                    <p className="text-xs text-gray-500">Update</p>
                  </div>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-line">
                  {post.google_content}
                </p>
                {post.google_image_url && (
                  <img
                    src={post.google_image_url}
                    alt="Post image"
                    className="w-full rounded border"
                  />
                )}
              </div>
            </TabsContent>
            )}
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
