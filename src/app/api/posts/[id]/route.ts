import { handle } from "@/lib/route";
import { deletePost, savePost } from "@/services/postService";

export const PATCH = handle(async ({ req, user, params }) => savePost(user, await req.json(), params.id), "employee.manage");
export const DELETE = handle(async ({ user, params }) => deletePost(user, params.id), "employee.manage");
