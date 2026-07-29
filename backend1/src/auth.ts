import { prisma } from "./db";
import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  elo: number;
}

export const verifyToken = async (token: string): Promise<AuthUser | null> => {
  try {
    // ✅ use supabase to verify the token instead of jsonwebtoken
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      logger.warn(`Supabase token verification failed: ${error?.message}`);
      return null;
    }

    const supabaseUser = data.user;
    logger.info(`Token decoded: ${supabaseUser.id} ${supabaseUser.email}`);

    let user = await prisma.user.findUnique({ where: { id: supabaseUser.id } });
    logger.info(`User found: ${user?.username}`);

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: supabaseUser.id,
          email: supabaseUser.email!,
          username: supabaseUser.email!.split("@")[0],
          provider: "supabase",
        },
      });
      logger.info(`User created: ${user.username}`);
    }

    return user;
  } catch (e) {
    logger.error(`Token verification failed: ${e}`);
    return null;
  }
};
