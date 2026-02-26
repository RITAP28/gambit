CREATE TYPE "public"."gameResultEnum" AS ENUM('white_win', 'black_win', 'draw');--> statement-breakpoint
CREATE TYPE "public"."gameStatusEnum" AS ENUM('waiting', 'in_progress', 'completed', 'abandoned', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."termination" AS ENUM('checkmate', 'resignation', 'timeout', 'stalemate', 'insufficient_material', 'threefold_repetition', 'fifty_move_rule', 'agreement', 'abondonment');--> statement-breakpoint
CREATE TYPE "public"."timeControlEnum" AS ENUM('bullet', 'blitz', 'rapid', 'classical', 'daily');--> statement-breakpoint
CREATE TYPE "public"."authProviderEnum" AS ENUM('credentials', 'google');--> statement-breakpoint
CREATE TYPE "public"."move_color_enum" AS ENUM('white', 'black');--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"white_player_id" uuid NOT NULL,
	"black_player_id" uuid NOT NULL,
	"timeControl" timeControlEnum NOT NULL,
	"time_limit_secs" integer NOT NULL,
	"increment_secs" integer DEFAULT 0,
	"status" "gameStatusEnum" NOT NULL,
	"winner" text,
	"termination" "termination",
	"initial_fen" text,
	"current_fen" text,
	"pgn" text,
	"white_time_left" integer,
	"black_time_left" integer,
	"is_rated" boolean DEFAULT true,
	"tournament_id" uuid,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	"authProvider" "authProviderEnum" DEFAULT 'credentials' NOT NULL,
	"bio" text,
	"is_authenticated" boolean DEFAULT false NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_password_unique" UNIQUE("password")
);
--> statement-breakpoint
CREATE TABLE "matchMakingQueues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"timeControl" timeControlEnum NOT NULL,
	"time_limit" integer NOT NULL,
	"increment" integer DEFAULT 0 NOT NULL,
	"rating_min" integer NOT NULL,
	"rating_max" integer NOT NULL,
	"is_rated" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp NOT NULL,
	CONSTRAINT "matchMakingQueues_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"move_number" integer NOT NULL,
	"color" "move_color_enum" NOT NULL,
	"san" varchar(255) NOT NULL,
	"uci" varchar(255) NOT NULL,
	"fen_after" text NOT NULL,
	"time_taken_milliseconds" integer NOT NULL,
	"clock_after_milliseconds" integer NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "moves_game_id_unique" UNIQUE("game_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"full_name" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"win_streak" integer DEFAULT 0 NOT NULL,
	"best_rating" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"time_control" timeControlEnum NOT NULL,
	"rating" integer DEFAULT 1200,
	"games_played" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_time_control_unique" UNIQUE("user_id","time_control")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_user_id" uuid,
	"accessToken" varchar(255),
	"refreshToken" varchar(255),
	"session_expires_at" timestamp NOT NULL,
	CONSTRAINT "sessions_session_user_id_unique" UNIQUE("session_user_id"),
	CONSTRAINT "sessions_accessToken_unique" UNIQUE("accessToken"),
	CONSTRAINT "sessions_refreshToken_unique" UNIQUE("refreshToken")
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_white_player_id_users_id_fk" FOREIGN KEY ("white_player_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_black_player_id_users_id_fk" FOREIGN KEY ("black_player_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchMakingQueues" ADD CONSTRAINT "matchMakingQueues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moves" ADD CONSTRAINT "moves_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_session_user_id_users_id_fk" FOREIGN KEY ("session_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;