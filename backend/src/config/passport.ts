import type { Request as ExpressRequest } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20";
import { prisma } from "./database";
import { env } from "./env";
import type { User as PrismaUser } from "@prisma/client";

export const isGoogleAuthConfigured =
  Boolean(env.GOOGLE_CLIENT_ID) && Boolean(env.GOOGLE_CLIENT_SECRET);

declare global {
  namespace Express {
    interface User extends PrismaUser {}
  }
}

export function configurePassport() {
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser<PrismaUser["id"]>(async (id, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return done(null, undefined);
      }
      done(null, user);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  if (isGoogleAuthConfigured) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          callbackURL: env.GOOGLE_CALLBACK_URL,
          passReqToCallback: false,
        },
        async (_accessToken, _refreshToken, profile: Profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(new Error("Google account has no email address"), undefined);
            }

            const googleId = profile.id;
            const name = profile.displayName || email;
            const avatar = profile.photos?.[0]?.value ?? null;

            const existing = await prisma.user.findUnique({ where: { googleId } });
            if (existing) {
              const updated = await prisma.user.update({
                where: { id: existing.id },
                data: { name, email, avatar },
              });
              return done(null, updated);
            }

            const byEmail = await prisma.user.findUnique({ where: { email } });
            if (byEmail) {
              const linked = await prisma.user.update({
                where: { id: byEmail.id },
                data: { googleId },
              });
              return done(null, linked);
            }

            const created = await prisma.user.create({
              data: { googleId, email, name, avatar },
            });
            return done(null, created);
          } catch (err) {
            return done(err as Error, undefined);
          }
        },
      ),
    );
  }
}
