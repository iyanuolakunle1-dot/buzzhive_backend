-- BuzzHive database schema — plain SQL, run this directly in the
-- Supabase SQL Editor (Project -> SQL Editor -> New query -> paste -> Run).
-- No Prisma, no ORM — this is the real, complete schema.

create extension if not exists pgcrypto; -- provides gen_random_uuid()

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text unique not null,
  email text unique not null,
  password text not null,
  bio text,
  location text,
  avatar text,
  cover_photo text,
  is_admin boolean not null default false,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  author_id uuid not null,
  constraint posts_author_id_fkey foreign key (author_id) references users(id) on delete cascade
);
create index posts_author_id_idx on posts(author_id);
create index posts_created_at_idx on posts(created_at desc);

create table comments (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  created_at timestamptz not null default now(),
  author_id uuid not null,
  post_id uuid not null,
  constraint comments_author_id_fkey foreign key (author_id) references users(id) on delete cascade,
  constraint comments_post_id_fkey foreign key (post_id) references posts(id) on delete cascade
);
create index comments_post_id_idx on comments(post_id);

create table likes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null,
  post_id uuid not null,
  constraint likes_user_id_fkey foreign key (user_id) references users(id) on delete cascade,
  constraint likes_post_id_fkey foreign key (post_id) references posts(id) on delete cascade,
  constraint likes_user_id_post_id_key unique (user_id, post_id)
);
create index likes_post_id_idx on likes(post_id);

create table follows (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  follower_id uuid not null,
  following_id uuid not null,
  constraint follows_follower_id_fkey foreign key (follower_id) references users(id) on delete cascade,
  constraint follows_following_id_fkey foreign key (following_id) references users(id) on delete cascade,
  constraint follows_follower_id_following_id_key unique (follower_id, following_id)
);
create index follows_following_id_idx on follows(following_id);
create index follows_follower_id_idx on follows(follower_id);

create table stories (
  id uuid primary key default gen_random_uuid(),
  image text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_id uuid not null,
  constraint stories_user_id_fkey foreign key (user_id) references users(id) on delete cascade
);
create index stories_expires_at_idx on stories(expires_at);

create table bookmarks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null,
  post_id uuid not null,
  constraint bookmarks_user_id_fkey foreign key (user_id) references users(id) on delete cascade,
  constraint bookmarks_post_id_fkey foreign key (post_id) references posts(id) on delete cascade,
  constraint bookmarks_user_id_post_id_key unique (user_id, post_id)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  recipient_id uuid not null,
  sender_id uuid not null,
  post_id uuid,
  constraint notifications_recipient_id_fkey foreign key (recipient_id) references users(id) on delete cascade,
  constraint notifications_sender_id_fkey foreign key (sender_id) references users(id) on delete cascade,
  constraint notifications_post_id_fkey foreign key (post_id) references posts(id) on delete cascade
);
create index notifications_recipient_id_idx on notifications(recipient_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  sender_id uuid not null,
  receiver_id uuid not null,
  constraint messages_sender_id_fkey foreign key (sender_id) references users(id) on delete cascade,
  constraint messages_receiver_id_fkey foreign key (receiver_id) references users(id) on delete cascade
);
create index messages_sender_receiver_idx on messages(sender_id, receiver_id);

-- Row Level Security stays OFF on all tables. The backend talks to this
-- database using the Supabase SERVICE ROLE key, which bypasses RLS by
-- design — all access control (who can read/write what) is enforced in
-- the Express API (JWT auth + isAdmin checks), not at the database layer.
-- Do not query these tables directly from the frontend with the anon key.
