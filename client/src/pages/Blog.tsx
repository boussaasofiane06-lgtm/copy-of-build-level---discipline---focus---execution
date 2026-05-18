import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const CATEGORIES = ["All", "Mindset", "Training", "Discipline", "Nutrition", "Lifestyle"];

export default function Blog() {
  const [activeCategory, setActiveCategory] = useState("All");
  const { data: posts = [], isLoading } = trpc.blog.list.useQuery({
    category: activeCategory === "All" ? undefined : activeCategory.toLowerCase(),
  });

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 px-4 border-b border-white/10">
        <div className="max-w-6xl mx-auto">
          <p className="font-display text-[#FF6B00] text-xs tracking-[0.3em] mb-4">KNOWLEDGE IS POWER</p>
          <h1 className="font-display text-5xl md:text-7xl font-black text-white tracking-tight leading-none mb-6">
            THE BUILD<br />
            <span className="text-[#FF6B00]">LEVEL</span> BLOG
          </h1>
          <p className="font-body text-[#888] text-lg max-w-xl">
            Mindset. Training. Discipline. Everything you need to build your level.
          </p>
        </div>
      </section>

      {/* Category Filter */}
      <section className="py-8 px-4 border-b border-white/10 sticky top-0 bg-[#0A0A0A] z-10">
        <div className="max-w-6xl mx-auto flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 font-display text-xs tracking-widest px-4 py-2 border transition-all ${
                activeCategory === cat
                  ? "bg-[#FF6B00] text-black border-[#FF6B00]"
                  : "bg-transparent text-[#888] border-white/20 hover:border-[#FF6B00] hover:text-white"
              }`}
            >
              {cat.toUpperCase()}
            </button>
          ))}
        </div>
      </section>

      {/* Posts Grid */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-[#1A1A1A] animate-pulse h-80" />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-24">
              <p className="font-display text-[#333] text-4xl font-black tracking-widest mb-4">NO POSTS YET</p>
              <p className="font-body text-[#555] text-sm">Check back soon — content is coming.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((post: any) => (
                <Link key={post.id} href={`/blog/${post.slug}`}>
                  <article className="group bg-[#111] border border-white/10 hover:border-[#FF6B00]/50 transition-all duration-300 cursor-pointer overflow-hidden">
                    {post.imageUrl ? (
                      <div className="aspect-video overflow-hidden">
                        <img
                          src={post.imageUrl}
                          alt={post.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      </div>
                    ) : (
                      <div className="aspect-video bg-[#1A1A1A] flex items-center justify-center">
                        <span className="font-display text-[#333] text-4xl font-black tracking-widest">BL</span>
                      </div>
                    )}
                    <div className="p-5">
                      <span className="font-display text-[#FF6B00] text-[10px] tracking-widest uppercase">
                        {post.category}
                      </span>
                      <h2 className="font-display text-white font-bold text-lg tracking-wide mt-2 mb-2 group-hover:text-[#FF6B00] transition-colors leading-snug">
                        {post.title}
                      </h2>
                      {post.excerpt && (
                        <p className="font-body text-[#666] text-sm line-clamp-2">{post.excerpt}</p>
                      )}
                      <div className="flex items-center justify-between mt-4">
                        <span className="font-body text-[#444] text-xs">
                          {new Date(post.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        <span className="font-display text-[#FF6B00] text-xs tracking-widest group-hover:translate-x-1 transition-transform inline-block">
                          READ →
                        </span>
                      </div>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
