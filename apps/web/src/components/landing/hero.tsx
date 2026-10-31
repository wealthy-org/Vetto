
"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowRight, ShieldCheck, Sparkles } from "lucide-react";

import { ParticleField } from "@/components/visual/particle-field";
import { OrbitalScene } from "@/components/visual/orbital-scene";
import { VettoCharacter } from "@/components/visual/vetto-character";

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.14,
    },
  },
};

const itemVariants = {
  hidden: {
    opacity: 0,
    y: 24,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
};

export function Hero() {
  const shouldReduceMotion = useReducedMotion();

  const animationProps = shouldReduceMotion
    ? {
        initial: false as const,
        animate: "visible",
      }
    : {
        initial: "hidden" as const,
        animate: "visible" as const,
      };

  return (
    <section
      id="home"
      className="vetto-hero ambient-background"
      aria-labelledby="hero-heading"
    >
      <div className="vetto-hero__grid grid-background grid-mask" />

      <div className="vetto-hero__ambient vetto-hero__ambient--left" />
      <div className="vetto-hero__ambient vetto-hero__ambient--right" />

      <ParticleField
        className="particle-field--subtle"
        particleCount={55}
        speed={0.7}
      />

      <div className="container-main vetto-hero__container">
        <motion.div
          className="vetto-hero__content"
          variants={containerVariants}
          {...animationProps}
        >
          <motion.div
            className="vetto-hero__eyebrow"
            variants={itemVariants}
          >
            <span className="vetto-hero__eyebrow-icon">
              <Sparkles size={13} />
            </span>

            <span>INDEPENDENT DEFI BANKER AGENT</span>

            <span className="vetto-hero__eyebrow-divider" />

            <span className="vetto-hero__chain">
              ROBINHOOD CHAIN
            </span>
          </motion.div>

          <motion.h1
            id="hero-heading"
            className="vetto-hero__title"
            variants={itemVariants}
          >
            Your DeFi banker.
            <br />
            <span className="text-gradient">
              Every move checked.
            </span>
          </motion.h1>

          <motion.p
            className="vetto-hero__description"
            variants={itemVariants}
          >
            Understand, plan, and interact with decentralized finance
            through natural language. VETTO helps you inspect opportunities,
            review transaction details, and stay in control before anything
            gets executed.
          </motion.p>

          <motion.div
            className="vetto-hero__actions"
            variants={itemVariants}
          >
            <Link
              href="/app"
              className="vetto-hero__primary-button"
            >
              Explore VETTO
              <ArrowRight size={17} />
            </Link>

            <Link
              href="#how-it-works"
              className="vetto-hero__secondary-button"
            >
              Discover how it works
              <ArrowDown size={15} />
            </Link>
          </motion.div>

          <motion.div
            className="vetto-hero__trust"
            variants={itemVariants}
          >
            <div className="vetto-hero__trust-icon">
              <ShieldCheck size={16} />
            </div>

            <p>
              <strong>You stay in control.</strong>
              <span>
                No transaction is executed without your explicit approval.
              </span>
            </p>
          </motion.div>
        </motion.div>

        <motion.div
          className="vetto-hero__visual"
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            duration: shouldReduceMotion ? 0 : 1.1,
            delay: shouldReduceMotion ? 0 : 0.25,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <OrbitalScene
            size={560}
            className="vetto-hero__orbital"
          >
            <VettoCharacter size={360} />
          </OrbitalScene>

          <div className="vetto-hero__visual-caption">
            <span className="vetto-hero__caption-indicator" />
            <span>INTELLIGENCE. TRANSPARENCY. CONTROL.</span>
          </div>
        </motion.div>
      </div>

      <div className="vetto-hero__bottom">
        <div className="container-main vetto-hero__bottom-inner">
          <span>BUILT FOR ROBINHOOD CHAIN</span>
          <span className="vetto-hero__bottom-line" />
          <span>CHAIN ID 4663</span>
        </div>
      </div>
    </section>
  );
}
