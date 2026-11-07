import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = (params.email as string).toLowerCase().trim();
        return {
          email,
          name: (params.name as string) ?? email.split("@")[0],
          role: (params.role === "admin" ? "admin" : "kitchen_staff"),
          isActive: params.isActive !== undefined ? Boolean(params.isActive) : true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
    }),
  ],
});
