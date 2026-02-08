import { NextRequest, NextResponse } from "next/server";
import * as linkedin from "@/lib/publishers/linkedin";
import * as x from "@/lib/publishers/x";
import * as facebook from "@/lib/publishers/facebook";
import * as googleBusiness from "@/lib/publishers/google";

export async function POST(request: NextRequest) {
  try {
    const { platform } = await request.json();

    let result: { success: boolean; message: string };

    switch (platform) {
      case "linkedin":
        result = await linkedin.testConnection();
        break;
      case "x":
        result = await x.testConnection();
        break;
      case "facebook":
        result = await facebook.testConnection();
        break;
      case "google":
        result = await googleBusiness.testConnection();
        break;
      default:
        return NextResponse.json(
          { error: "Unknown platform" },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
