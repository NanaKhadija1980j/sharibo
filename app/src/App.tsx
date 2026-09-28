import { useState, useRef, useEffect, useCallback } from "react";
import { Keypair } from "@stellar/stellar-sdk";
import {
  isConnected,
  requestAccess,
  isAllowed,
  getAddress,
  getNetworkDetails,
  signTransaction as freighterSignTx
} from "@stellar/freighter-api";
import {
  generateIdentity,
  computeExternalNullifier,
  MerkleTree,
  generateProof,
  verifyProofLocally,
  verificationKeyToContractFormat,
  connect,
  connectReadOnly,
  createCircle,
  fund,
  claim,
  cancelCircle,
  getCircle,
  hasClaimed,
  TREE_LEVELS,
  xlmToStroops,
  formatXlm,
  type Identity,
  type ContractProof,
  type CircleId,
  makeCircleId,
  ContractError,
  CircleNotFoundError,
  RoundNotFundedError,
  WrongRoundTagError,
  AlreadyClaimedError,
  InvalidProofError,
  RoundFullError,
  OverflowError,
  CircleCancelledError,
  RpcError,
  ProvingError,
  InvalidInputError,
  networkOf,
} from "@sharibo/client";
import { config, configError } from "./config";
import { useI18n, LanguageSwitcher } from "./i18n";
import { usePoliteLiveRegion } from "./usePoliteLiveRegion";
import { ArtifactProgress } from "./components/ArtifactProgress.js";
import { explorerTx, short, explorerAccount, explorerContract } from "./lib/explorer";
import type { CirclePhase } from "./hooks/useCircleFlow";
import { MemberRingSkeleton } from "./components/MemberRing";
import { FundingListSkeleton } from "./components/FundingList";
import {
  friendbotFund as fundWithFriendbot,
  FriendbotRetryableError,
} from "./lib/friendbot";
import styles from "./App.module.css";
import { checkNetworkMatch } from "./lib/wallet.freighter";
import { Toaster } from "./components/Toaster";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { diagnose, type Failure } from "./state/circleMachine";
import { toUiError, getErrorMessage } from "./lib/uiError";
import { readSessionState, clearSessionState } from "./lib/session";
// Leaf components extracted from this file into app/src/components/ (#508).
// App.tsx is now the wiring only; everything it used to define inline above
// `export default function App()` lives in a module with its own test.
import {
  ClaimExplainer,
  ClaimProgress,
  CLAIM_STAGE_LABELS,
  CopyButton,
  CopyDebugBundleButton,
  EnvSetupScreen,
  LiveRegion,
  MemberRing,
  NetworkBanner,
  Stepper,
  TestnetBanner,
} from "./components";

// `config` is null when config validation failed (see config.ts); the component
// below gates on `configError.length > 0` and renders the setup screen, so these
// module-level values are only ever used on the happy path. Optional chaining
// keeps importing this module from crashing on a misconfigured build.
const NETWORK = {
  contractId: config?.contractId ?? "",
  rpcUrl: config?.rpcUrl ?? "",
  networkPassphrase: config?.networkPassphrase ?? "",
};
const TOKEN = config?.testTokenContractId ?? "";
const LEVELS = TREE_LEVELS;
const CIRCLE_SIZE = 5;

const NAMES = [
  "ajo",
  "esusu",
  "tanda",
  "cundina",
  "susu",
  "tontine",
  "junta",
  "pandero",
  "consórcio",
  "hui",
  "paluwagan",
  "chit fund",
];

interface Member {
  keypair: Keypair;
  identity: Identity;
  funded: boolean;
  fundHash?: string;
  freighterKey?: string;
  ineligible?: boolean;
  ineligibleReason?: string;
  pending?: boolean; // Optimistic flag while transaction is in flight
}

interface ClaimResult {
  recipient: string;
  hash: string;
  proofDurationMs: number;
  verifyTimeMs: number;
}

import type { ClaimStage } from "./types.js";

// ── Root component ───────────────────────────────────────────────────────────

export default function App() {
  const { t } = useI18n();
  const online = useOnlineStatus();
  const [failure, setFailure] = useState<Failure | null>(null);

  if (configError.length > 0) {
    return <EnvSetupScreen errors={configError} />;
  }

  const [screen, setScreen] = useState<"landing" | "circle">("landing");
  const [circlePhase, setCirclePhase] = useState<CirclePhase>("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<any[]>([]);

  const [contributionXlm, setContributionXlm] = useState(10);
  const [admin, setAdmin] = useState<Keypair | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tree, setTree] = useState<MerkleTree | null>(null);
  const [circleId, setCircleId] = useState<CircleId | null>(null);
  const [hasFreighter, setHasFreighter] = useState(false);

  useEffect(() => {
    isConnected().then((res) => setHasFreighter(res.isConnected)).catch(() => setHasFreighter(false));
  }, []);
  const [round, setRound] = useState(0);
  const [pot, setPot] = useState(0n);
  const [feeBps, setFeeBps] = useState(0);
  const [feeRecipient, setFeeRecipient] = useState("");
  const [onChainContributors, setOnChainContributors] = useState<string[]>([]);
  const [cancelled, setCancelled] = useState(false);
  const [claimantIndex, setClaimantIndex] = useState(0);
  const [proof, setProof] = useState<ContractProof | null>(null);
  const [nullifierHash, setNullifierHash] = useState<bigint | null>(null);
  const [claimResult, setClaimResult] = useState<ClaimResult | null>(null);
  const [isProving, setIsProving] = useState(false);
  const [provingElapsedMs, setProvingElapsedMs] = useState<number | null>(null);
  const [nullifierClaimed, setNullifierClaimed] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  const [claimStage, setClaimStage] = useState<ClaimStage | null>(null);
  const [proveElapsedSeconds, setProveElapsedSeconds] = useState(0);
  // Step timings (ms) collected during doClaim for the debug bundle.
  const [stepTimings, setStepTimings] = useState<Record<string, number>>({});
  // Survives a reset so the landing screen can point back at the circle you
  // just left — it keeps living on-chain even though the UI has moved on.
  const [previousCircleId, setPreviousCircleId] = useState<CircleId | null>(null);

  const [resumePrompt, setResumePrompt] = useState<any>(null);

  useEffect(() => {
    // Reads (and bigint-decodes) the persisted demo state; a corrupt entry is
    // cleared for us. See lib/session.ts.
    const saved = readSessionState();
    if (saved) setResumePrompt(saved);
  }, []);

  const [prevCircle, setPrevCircle] = useState<{ id: string; explorerUrl: string } | null>(null);

  const contribution = xlmToStroops(contributionXlm);
  // Holds the AbortController for the currently-running claim flow so that
  // resetToLanding and the unmount cleanup can cancel it synchronously.
  const claimAbortRef = useRef<AbortController | null>(null);

  // Abort any in-flight claim when the component unmounts (e.g. the user
  // navigates away mid-proof).  This prevents a stale setState from firing on
  // a dead component and triggering React's "Can't perform a React state
  // update on an unmounted component" warning.
  useEffect(() => {
    return () => {
      claimAbortRef.current?.abort();
    };
  }, []);
  const fundedCount = members.filter((m) => m.funded).length;
  const fullyFunded = pot === contribution * BigInt(CIRCLE_SIZE);
  const { announce, message: liveRegionMessage } = usePoliteLiveRegion(120);

  // Sync funding state from on-chain data
  const syncFundingState = useCallback(async () => {
    if (!admin || circleId === null) return;
    try {
      const { connect, getCircle } = await import("@sharibo/client");
      const adminClient = await connect(NETWORK, admin);
      const circle = await getCircle(adminClient, circleId);
      
      setPot(circle.pot);
      setOnChainContributors(circle.contributors);
      setCancelled(circle.cancelled);
      setFeeBps(circle.fee_bps ?? 0);
      setFeeRecipient(circle.fee_recipient ?? "");
      
      // Update member funded status based on on-chain contributors
      setMembers((prev) =>
        prev.map((m) => {
          const hasFunded =
            circle.contributors.includes(m.keypair.publicKey()) ||
            Boolean(m.freighterKey && circle.contributors.includes(m.freighterKey));
          return { ...m, funded: hasFunded, pending: false };
        })
      );
    } catch (e) {
      console.error("Failed to sync funding state:", e);
    }
  }, [admin, circleId]);

  // Sync funding state when circleId changes or on mount
  useEffect(() => {
    if (circleId !== null && admin) {
      syncFundingState();
    }
  }, [circleId, admin, syncFundingState]);

  // Poll for third-party funding updates every 10 seconds when circle is active
  useEffect(() => {
    if (circleId !== null && admin && screen === "circle" && !claimResult) {
      const interval = setInterval(() => {
        syncFundingState();
      }, 10000); // Poll every 10 seconds
      return () => clearInterval(interval);
    }
  }, [circleId, admin, screen, claimResult, syncFundingState]);

  useEffect(() => {
    if (busy) {
      announce(t("liveRegion.help", { message: busy }));
      return;
    }

    if (circlePhase === "loading") {
      announce("Loading circle data…");
      return;
    }

    if (claimResult) {
      announce(t("liveRegion.claimResultReady"));
      return;
    }

    if (error) {
      announce(t("liveRegion.error", { message: error }));
      return;
    }

    if (fullyFunded) {
      announce(t("liveRegion.claimStepReady"));
    }
  }, [announce, busy, circlePhase, claimResult, error, fullyFunded]);

  // ── Focus management ────────────────────────────────────────────────────
  // When a screen or major section appears, move keyboard focus to its
  // heading (tabIndex={-1} makes non-interactive elements programmatically
  // focusable without inserting them into the Tab order).

  // 1. landing → circle: focus the circle card's "SHARIBO" h1
  const circleHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (screen === "circle") circleHeadingRef.current?.focus();
  }, [screen]);

  const claimHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (fullyFunded && !claimResult) {
      claimHeadingRef.current?.focus();
    }
    // Only trigger when fullyFunded flips to true; ignore claimResult changes here.
  }, [fullyFunded, claimResult]);

  const payoutHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (claimResult) {
      payoutHeadingRef.current?.focus();
    }
  }, [claimResult]);
  
  // When the claim step becomes available, pre-check each member's nullifier
  // against `has_claimed` so we can mark ineligible members immediately
  // (avoids generating a slow proof only to be rejected on-chain).
  useEffect(() => {
    let mounted = true;
    async function checkEligibility() {
      if (!fullyFunded || claimResult || !circleId || !admin) return;
      try {
        setBusy("Checking member eligibility…");
        const client = await import("@sharibo/client");
        const { computeExternalNullifier, computeNullifierHash, connect, hasClaimed } = client;
        const external = await computeExternalNullifier(circleId, BigInt(round));
        const adminClient = await connect(NETWORK, admin);
        const results = await Promise.all(
          members.map(async (m) => {
            const nullifier = computeNullifierHash(m.identity.identityNullifier, external);
            return await hasClaimed(adminClient, circleId, nullifier);
          }),
        );
        if (!mounted) return;
        setMembers((prev) => prev.map((m, i) => ({ ...m, ineligible: results[i], ineligibleReason: results[i] ? "Already claimed in this circle" : undefined })));
      } catch (e) {
        setError(toUiError(e, t));
      } finally {
        if (mounted) setBusy(null);
      }
    }
    checkEligibility();
    return () => { mounted = false; };
  }, [fullyFunded, claimResult, circleId, round, admin]);
  // ────────────────────────────────────────────────────────────────────────

  // Every hook above must run on every render, so this check — which used to
  // sit at the top of the component and return before any hooks ran — moved
  // here instead. configError is computed once at module load, so this still
  // reliably short-circuits into the setup screen; it just no longer skips
  // hook calls to do it.
  if (configError.length > 0) {
    return <EnvSetupScreen errors={configError} />;
  }

  // Reset every piece of React state back to its initial value and return to
  // the landing screen. The circle itself is never touched on-chain — it lives
  // on forever; we just stop pointing the UI at it (and remember its id so the
  // landing screen can link back to it). Confirm first only when a circle is
  // mid-flow — funded but not yet claimed — so an accidental click can't throw
  // away an in-progress round; a completed or untouched circle resets silently.
  function resetToLanding() {
    const midFlow = fundedCount > 0 && !claimResult;
    if (midFlow) {
      const ok = window.confirm(t("reset.confirm"));
      if (!ok) return;
    }

    // Cancel any in-flight proof generation / artifact download.
    claimAbortRef.current?.abort();
    claimAbortRef.current = null;

    setPreviousCircleId(circleId);
    sessionStorage.removeItem("sharibo_demo_state");

    setBusy(null);
    setError(null);
    setCirclePhase("idle");
    setContributionXlm(10);
    setAdmin(null);
    setMembers([]);
    setTree(null);
    setCircleId(null);
    setRound(0);
    setPot(0n);
    setCancelled(false);
    setOnChainContributors([]);
    setClaimantIndex(0);
    setProof(null);
    setNullifierHash(null);
    setClaimResult(null);
    setIsProving(false);
    setProvingElapsedMs(null);
    setNullifierClaimed(false);
    setRejection(null);
    setClaimStage(null);
    setProveElapsedSeconds(0);
    setScreen("landing");
  }

  function loadState(parsed: any) {
    setCirclePhase("loading");
    setContributionXlm(parsed.contributionXlm);
    setAdmin(Keypair.fromSecret(parsed.adminSecret));
    
    const loadedMembers = parsed.members.map((m: any) => ({
      keypair: Keypair.fromSecret(m.secret),
      identity: m.identity,
      funded: false, // Will be synced from on-chain
      fundHash: m.fundHash,
      ineligible: m.ineligible ?? false,
      pending: false,
    }));
    setMembers(loadedMembers);
    
    const newTree = MerkleTree.create(
      LEVELS,
      loadedMembers.map((m: any) => m.identity.commitment)
    );
    setTree(newTree);

    setCircleId(parsed.circleId);
    setRound(parsed.round);
    setPot(0n); // Will be synced from on-chain
    setClaimantIndex(parsed.claimantIndex);
    setProof(parsed.proof);
    setNullifierHash(parsed.nullifierHash);
    setClaimResult(parsed.claimResult);
    setRejection(parsed.rejection);
    
    setScreen("circle");
    setResumePrompt(null);
    
    // Sync from on-chain after loading state
    setTimeout(() => syncFundingState(), 100);
    setCirclePhase("ready");
  }

  async function startCircle() {
    setError(null);
    setCirclePhase("loading");
    setBusy(
      "Generating a fresh admin + 5 member identities and funding via friendbot…",
    );
    try {
      const [{ Keypair }, client] = await Promise.all([
        import("@stellar/stellar-sdk"),
        import("@sharibo/client")
      ]);
      const { generateIdentity, MerkleTree, verificationKeyToContractFormat, connect, createCircle } = client;

      setBusy(t("busy.generating"));
      const adminKp = Keypair.random();
      await fundWithFriendbot(adminKp.publicKey());

      const newMembers: Member[] = Array.from({ length: CIRCLE_SIZE }, () => ({
        keypair: Keypair.random(),
        identity: generateIdentity(),
        funded: false,
        ineligible: false,
      }));

      const newTree = MerkleTree.create(
        LEVELS,
        newMembers.map((m) => m.identity.commitment),
      );

      setBusy(t("busy.creating"));
      const vkJson = await fetch("/circuits/verification_key.json").then((r) =>
        r.json(),
      );
      const vk = verificationKeyToContractFormat(vkJson);
      const adminClient = await connect({ ...NETWORK, onEvent: (e) => setEvents(prev => [...prev, e]) }, adminKp);
      const { result: newCircleId } = await createCircle(adminClient, {
        admin: adminKp.publicKey(),
        token: TOKEN,
        root: newTree.root,
        contribution,
        size: CIRCLE_SIZE,
        vk,
        feeBps: 0,
        feeRecipient: adminKp.publicKey(),
      });

      setAdmin(adminKp);
      setMembers(newMembers);
      setTree(newTree);
      setCircleId(makeCircleId(newCircleId));
      setRound(0);
      setPot(0n);
      setFeeBps(0);
      setFeeRecipient("");
      setScreen("circle");
      setCirclePhase("ready");
    } catch (e) {
      setError(toUiError(e, t));
      setCirclePhase("error");
    } finally {
      setBusy(null);
    }
  }

  async function fundMember(i: number) {
    if (!admin || circleId === null) return;
    setError(null);
    setBusy(t("fund.busy", { index: i + 1 }));
    try {
      const [{ Keypair }, { connect, fund }] = await Promise.all([
        import("@stellar/stellar-sdk"),
        import("@sharibo/client")
      ]);
      const m = members[i];
      await fundWithFriendbot(m.keypair.publicKey());
      
      // Set optimistic pending state
      setMembers((prev) =>
        prev.map((mm, idx) =>
          idx === i ? { ...mm, pending: true } : mm,
        ),
      );
      
      const memberClient = await connect(NETWORK, m.keypair);
      const { hash } = await fund(memberClient, {
        circleId,
        from: m.keypair.publicKey(),
      });
      
      // Sync with on-chain state after submission
      await syncFundingState();
      
      // Update fund hash for the successful transaction
      setMembers((prev) =>
        prev.map((mm, idx) =>
          idx === i ? { ...mm, fundHash: hash } : mm,
        ),
      );
    } catch (e) {
      // Clear pending state on error
      setMembers((prev) =>
        prev.map((mm, idx) =>
          idx === i ? { ...mm, pending: false } : mm,
        ),
      );
      setError(toUiError(e, t));
    } finally {
      setBusy(null);
    }
  }

  async function fundWithFreighter(i: number) {
    if (!admin || circleId === null) return;
    setError(null);
    setBusy(t("fund.busyFreighter", { index: i + 1 }));
    try {
      const allowedRes = await isAllowed();
      if (!allowedRes.isAllowed) {
        await requestAccess();
      }

      const networkRes = await getNetworkDetails();
      
      // Check for network mismatch between wallet and app config
      const mismatch = checkNetworkMatch(networkRes.network, NETWORK.networkPassphrase);
      if (mismatch) {
        throw new Error(
          `Your Freighter wallet is connected to ${mismatch.walletNetwork}, ` +
          `but this app is configured for ${mismatch.appNetwork}. ` +
          `Please open Freighter, click the network selector in the upper right, and switch to ${mismatch.appNetwork}.`
        );
      }

      const addressRes = await getAddress();
      const pubKey = addressRes.address;
      if (!pubKey) {
        throw new Error(t("error.getAddress"));
      }
      
      const freighterSigner = {
        publicKey: pubKey,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        signTransaction: async (txXdr: string, opts?: any) => {
          // Re-check network before signing to catch mid-session network switches
          const currentNetworkRes = await getNetworkDetails();
          const currentMismatch = checkNetworkMatch(currentNetworkRes.network, NETWORK.networkPassphrase);
          if (currentMismatch) {
            throw new Error(
              `Your Freighter wallet is connected to ${currentMismatch.walletNetwork}, ` +
              `but this app is configured for ${currentMismatch.appNetwork}. ` +
              `Please open Freighter, click the network selector in the upper right, and switch to ${currentMismatch.appNetwork}.`
            );
          }

          const signedRes = await freighterSignTx(txXdr, {
            networkPassphrase: currentNetworkRes.networkPassphrase
          });
          if (signedRes.error) {
            throw new Error(signedRes.error.toString());
          }
          return signedRes.signedTxXdr;
        }
      };

      // Set optimistic pending state
      setMembers((prev) =>
        prev.map((mm, idx) =>
          idx === i ? { ...mm, pending: true } : mm,
        ),
      );

      const { connect, fund } = await import("@sharibo/client");
      const memberClient = await connect(NETWORK, freighterSigner);
      const { hash } = await fund(memberClient, {
        circleId,
        from: pubKey,
      });

      // Sync with on-chain state after submission
      await syncFundingState();
      
      // Update fund hash and freighter key for the successful transaction
      setMembers((prev) =>
        prev.map((mm, idx) => (idx === i ? { ...mm, fundHash: hash, freighterKey: pubKey } : mm)),
      );
    } catch (e) {
      // Clear pending state on error
      setMembers((prev) =>
        prev.map((mm, idx) =>
          idx === i ? { ...mm, pending: false } : mm,
        ),
      );
      setError(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function doClaim() {
    if (!admin || !tree || circleId === null) return;

    // Cancel any previous claim that might still be running.
    claimAbortRef.current?.abort();
    const controller = new AbortController();
    claimAbortRef.current = controller;
    const { signal } = controller;

    setError(null);
    setClaimResult(null);
    setRejection(null);
    setBusy(t("busy.claiming"));
    try {
      const [{ Keypair }, { computeExternalNullifier, generateProof, verifyProofLocally, connect, claim, getCircle, hasClaimed }] = await Promise.all([
        import("@stellar/stellar-sdk"),
        import("@sharibo/client")
      ]);

      if (signal.aborted) return;
      const claimant = members[claimantIndex];
      const merkleProof = tree.proof(claimantIndex);
      const externalNullifier = await computeExternalNullifier(circleId, BigInt(round));

      if (signal.aborted) return;
      setClaimStage("artifacts");
      const [wasm, zkey, vkJson] = await Promise.all([
        fetch("/circuits/membership.wasm")
          .then((r) => r.arrayBuffer())
          .then((b) => new Uint8Array(b)),
        fetch("/circuits/membership_final.zkey", { signal })
          .then((r) => r.arrayBuffer())
          .then((b) => new Uint8Array(b)),
        fetch("/circuits/verification_key.json").then((r) => r.json()),
      ]);

      if (signal.aborted) return;
      setClaimStage("proving");
      setProveElapsedSeconds(0);
      const proveTimer = setInterval(() => setProveElapsedSeconds((s) => s + 1), 1000);
      let generated;
      try {
        generated = await generateProof(
          {
            identityNullifier: claimant.identity.identityNullifier,
            identitySecret: claimant.identity.identitySecret,
            pathElements: merkleProof.pathElements,
            pathIndices: merkleProof.pathIndices,
            root: tree.root,
            externalNullifier,
          },
          wasm,
          zkey,
          { signal, onEvent: (e) => setEvents((prev) => [...prev, e]) },
        );
      } finally {
        clearInterval(proveTimer);
      }

      setClaimStage("verifying");
      const verifyTimeMs = await verifyProofLocally(
        vkJson,
        generated.publicSignals,
        generated.snarkjsProof,
      );

      setClaimStage("funding");
      const recipient = Keypair.random();
      await fundWithFriendbot(recipient.publicKey());

      if (signal.aborted) return;
      setClaimStage("submitting");
      const adminClient = await connect({ ...NETWORK, onEvent: (e) => setEvents(prev => [...prev, e]) }, admin);
      const { hash } = await claim(adminClient, {
        circleId,
        recipient: recipient.publicKey(),
        nullifierHash: generated.nullifierHash,
        externalNullifier: generated.externalNullifier,
        proof: generated.proof,
      });

      if (signal.aborted) return;
      setProof(generated.proof);
      setNullifierHash(generated.nullifierHash);
      setClaimResult({
        recipient: recipient.publicKey(),
        hash,
        proofDurationMs: generated.provingTimeMs,
        verifyTimeMs,
      });
      setNullifierClaimed(await hasClaimed(adminClient, circleId, generated.nullifierHash));

      // Sync with on-chain state after claim
      await syncFundingState();
    } catch (e) {
      setError(toUiError(e, t));
    } finally {
      if (!signal.aborted) {
        setBusy(null);
        setClaimStage(null);
      }
      // Release the ref only if this controller is still the active one.
      if (claimAbortRef.current === controller) {
        claimAbortRef.current = null;
      }
    }
  }

  async function claimAgain() {
    if (!admin || circleId === null || !proof || nullifierHash === null) return;
    setError(null);
    setRejection(null);
    setBusy(t("busy.refunding"));
    try {
      const [{ Keypair }, { connect, fund, computeExternalNullifier, claim }] = await Promise.all([
        import("@stellar/stellar-sdk"),
        import("@sharibo/client")
      ]);
      // Fund round `round` again so this exercises the nullifier-reuse
      // check specifically, not just "the pot is empty" — the same
      // proof's nullifier gets rejected even against a fresh, funded round.
      const adminClient = await connect({ ...NETWORK, onEvent: (e) => setEvents(prev => [...prev, e]) }, admin);
      for (const m of members) {
        const memberClient = await connect({ ...NETWORK, onEvent: (e) => setEvents(prev => [...prev, e]) }, m.keypair);
        await fund(memberClient, { circleId, from: m.keypair.publicKey() });
      }
      const freshExternalNullifier = await computeExternalNullifier(
        circleId,
        BigInt(round),
      );

      setBusy(t("busy.replaying"));
      await claim(adminClient, {
        circleId,
        recipient: Keypair.random().publicKey(),
        nullifierHash,
        externalNullifier: freshExternalNullifier,
        proof,
      });
      setRejection(t("rejection.unexpected"));
    } catch (e) {
      setRejection(toUiError(e, t));
    } finally {
      // Reflect the on-chain state either way: the re-funding above happened
      // for real even though the replayed claim itself was rejected.
      try {
        await syncFundingState();
      } catch {
        // best-effort refresh only
      }
      setBusy(null);
    }
  }

  async function doCancelCircle() {
    if (!admin || circleId === null) return;
    setError(null);
    
    const refundCount = onChainContributors.length;
    const refundTotal = (Number(pot) / 1e7).toFixed(1);
    
    const confirmed = window.confirm(
      t("cancel.confirmation", { count: refundCount, total: refundTotal })
    );
    
    if (!confirmed) return;
    
    setBusy(t("cancel.busy"));
    try {
      const { connect, cancelCircle } = await import("@sharibo/client");
      const adminClient = await connect(NETWORK, admin);
      await cancelCircle(adminClient, { circleId });
      
      // Sync with on-chain state after cancellation
      await syncFundingState();
    } catch (e) {
      setError(toUiError(e, t));
    } finally {
      setBusy(null);
    }
  }

  if (resumePrompt && screen === "landing") {
    return (
      <div className={styles.page}>
        <div className={`${styles.card} ${styles.hero}`}>
          <h1>Resume Circle #{resumePrompt.circleId.toString()}?</h1>
          <p className={styles.sub}>
            It looks like you refreshed the page while a circle was active. Do you want to resume?
          </p>
          <div className={styles.row} style={{ marginTop: '2rem', justifyContent: 'center', gap: '1rem' }}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => loadState(resumePrompt)}>
              Resume Circle
            </button>
            <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => {
              sessionStorage.removeItem("sharibo_demo_state");
              setResumePrompt(null);
            }}>
              {t("resume.discardButton")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "landing") {
    return (
      <div className={styles.page}>
        <NetworkBanner />
        {!online && (
          <div className="offline-banner" role="status">
            You are offline. Network actions are paused — reconnect to start or retry a circle.
          </div>
        )}
                <div className={`${styles.card} ${styles.hero}`}>
          <LanguageSwitcher className={styles.languageSwitcherHero} />
          <div className={styles.namewall}>
            {NAMES.map((n) => (
              <span key={n} className={styles.namewallItem}>
                {n}
              </span>
            ))}
          </div>
          <h1>SHARIBO</h1>
          <p className={styles.tagline}>
            A private rotating savings circle — on Stellar, with real
            zero-knowledge proofs.
          </p>
          <p className={styles.sub}>
            Every round, everyone contributes. Every round, one member takes the
            pot. Sharibo proves <em>who's entitled to claim</em> without ever
            revealing <em>who</em> claimed.
          </p>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={!online || !!busy}
            onClick={startCircle}
          >
            {busy ?? t("landing.launch")}
          </button>
          {error && <p className={styles.error}>{error}</p>}
          <Toaster failure={failure} busy={!!busy} online={online} onDismiss={() => setFailure(null)} />
          {previousCircleId !== null && (
            <p className={styles.fineprint}>
              Your previous circle lives on at{" "}
              <a
                className={styles.link}
                href={explorerContract()}
                target="_blank"
                rel="noreferrer"
              >
                {t("landing.previousCircleLink", { id: previousCircleId.toString() })}
              </a>
            </p>
          )}
          <p className={styles.fineprint}>
            Testnet only. Demo identities are generated fresh in your browser,
            never reused.
          </p>
          {prevCircle && (
            <p className={styles.fineprint}>
              Your previous circle #{prevCircle.id} lives on-chain —{" "}
              <a className={styles.link} href={prevCircle.explorerUrl} target="_blank" rel="noreferrer">
                view on explorer ↗
              </a>
            </p>
          )}
        </div>
      </div>
    );
  }

  const step: 0 | 1 | 2 | 3 = claimResult ? 3 : fullyFunded ? 2 : 1;

  return (
    <div className={styles.page}>
      <NetworkBanner />
      <div className={styles.card}>
        <LanguageSwitcher />
        {/*
          Persistent live region — always in the DOM so the browser registers
          it before any text lands inside it (a common AT pitfall).
        */}
        <LiveRegion message={liveRegionMessage} />
        <ArtifactProgress announce={announce} />
        {!online && (
          <div className="offline-banner" role="status">
            You are offline. Network actions are paused — reconnect to fund, claim, or retry.
          </div>
        )}
        <div className="row space-between">
          <h1 className="small" ref={circleHeadingRef} tabIndex={-1}>
            SHARIBO
          </h1>
          <div className="row">
            <ConnectionStatus online={online} />
            <a className="link" href={explorerContract()} target="_blank" rel="noreferrer">
              circle #{circleId?.toString()} on-chain ↗
            </a>
            <button
              className="btn btn-small"
              disabled={!!busy}
              onClick={resetToLanding}
              title={`Start over. Your current circle (#${circleId?.toString()}) keeps living on-chain.`}
            >
              {t("common.startNewCircle")}
            </button>
          </div>
        </div>

        <Stepper step={step} />

        {circlePhase === "loading" ? (
          <>
            <MemberRingSkeleton />
            <div className="pot-bar-wrap" aria-hidden="true">
              <div className="skeleton skeleton-bar" />
            </div>
            <p className="pot-label" aria-hidden="true">
              <span className="skeleton skeleton-label" />
            </p>
            <FundingListSkeleton />
          </>
        ) : (
          <>
            <MemberRing members={members.map(m => ({ funded: m.funded, pending: m.pending }))} revealed={!!claimResult} />

            <div className={styles.potBarWrap}>
              <div
                className="pot-bar"
                style={{ width: `${(fundedCount / CIRCLE_SIZE) * 100}%` }}
              />
            </div>
            <p className="pot-label">
              pot: {(Number(pot) / 1e7).toFixed(1)} / {contributionXlm * CIRCLE_SIZE} XLM ·
              round {round}
              {feeBps > 0 &&
                ` · ${t("pot.fee", {
                  feePercent: (feeBps / 100).toString(),
                  feeRecipient: feeRecipient ? feeRecipient.slice(0, 8) : t("pot.feeUnknown"),
                })}`}
              {cancelled && ` · ${t("cancel.cancelled")}`}
            </p>

        {cancelled && (
          <div className="callout" style={{ backgroundColor: "var(--color-warning-bg)", color: "var(--color-warning-text)" }}>
            <strong>{t("cancel.cancelled")}</strong>
            <p>{t("cancel.cancelledMessage")}</p>
          </div>
        )}

        {!cancelled && admin && (
          <div className="row" style={{ justifyContent: "flex-end", marginTop: "1rem" }}>
            <button
              className="btn btn-danger btn-small"
              disabled={!!busy || onChainContributors.length === 0}
              onClick={doCancelCircle}
              title="Cancel this circle and refund all contributors"
            >
              {t("cancel.title")}
            </button>
          </div>
        )}

        <h2>Fund</h2>
        <div className={styles.members}>
          {members.map((m, i) => (
            <div key={i} className={`member ${m.funded ? "funded" : ""} ${m.pending ? "pending" : ""}`}>
              <span className="member-addr">
                {t("fund.memberLabel", { index: i + 1 })} · {short(m.keypair.publicKey())}
                <CopyButton
                  value={m.keypair.publicKey()}
                  label={t("fund.memberAddressLabel", { index: i + 1 })}
                />
              </span>
              {m.pending ? (
                <span className="pending-indicator">⟳ submitting…</span>
              ) : m.funded ? (
                <a
                  className={styles.link}
                  href={explorerTx(m.fundHash!)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("fund.fundedLink")}
                </a>
              ) : (
                <div className={styles.row}>
                  <button
                    className={`${styles.btn} ${styles.btnSmall}`}
                    disabled={!online || !!busy || round > 0}
                    onClick={() => fundMember(i)}
                  >
                    {t("fund.demoButton", { amount: contributionXlm })}
                  </button>
                  {hasFreighter && (
                    <button
                      className={`${styles.btn} ${styles.btnSmall}`}
                      disabled={!online || !!busy || round > 0}
                      onClick={() => fundWithFreighter(i)}
                    >
                      {t("fund.freighterButton")}
                    </button>
                  )}
                </div>
              )}
                </div>
              ))}
            </div>
          </>
        )}

        {fullyFunded && !claimResult && (
          <>
            <h2 ref={claimHeadingRef} tabIndex={-1}>
              {t("claim.heading")}
            </h2>
            <p className={styles.sub}>
              Pick which member is claiming this round — the proof will show the
              contract that they're a real member <em>without</em> revealing
              which one.
            </p>
            <div className="row">
              {members.map((m, i) => (
                <label key={i} className="radio">
                  <input
                    type="radio"
                    checked={claimantIndex === i}
                    onChange={() => setClaimantIndex(i)}
                    disabled={!!busy || !!m.ineligible}
                    title={m.ineligible ? m.ineligibleReason ?? "Ineligible to claim" : undefined}
                  />
                  member {i + 1}{m.ineligible ? " (ineligible)" : ""}
                </label>
              ))}
            </div>
            <button className="btn btn-primary" disabled={!online || !!busy} onClick={doClaim}>
              {claimStage ? CLAIM_STAGE_LABELS[claimStage] : "Generate proof & claim"}
            </button>
            <ClaimExplainer />
            {busy && (
              <p className={styles.techline}>
                {/* Constraint count: update this AND circuits/README.md if the circuit changes. */}
                Groth16 · BLS12-381 · 3,757 constraints · proving locally in your browser, nothing
                sent anywhere until the proof is done
                {isProving && proveElapsedSeconds !== null ? ` · proving… ${proveElapsedSeconds}s` : ""}
              </p>
            )}
          </>
        )}

        {claimResult && (
          <div className={styles.result}>
            <h2 ref={payoutHeadingRef} tabIndex={-1}>
              {t("result.heading")}
            </h2>
            <p>
              {t("result.recipientIntro")} <code>{short(claimResult.recipient)}</code>
              <CopyButton
                value={claimResult.recipient}
                label={t("result.recipientLabel")}
              />{" "}
              <a href={explorerAccount(claimResult.recipient)} target="_blank" rel="noreferrer">
                ↗
              </a>{" "}
              {t("result.recipientOutro")}
            </p>
            <a
              className={styles.link}
              href={explorerTx(claimResult.hash)}
              target="_blank"
              rel="noreferrer"
            >
              {t("result.viewClaimTx")}
            </a>
            <CopyButton value={claimResult.hash} label="claim transaction hash" />
            <p className={styles.callout}>
              Compare the 5 funding transactions above to this claim — same
              contract, no shared address, no visible link.
            </p>
            <p className="techline">
              proof generated in {(claimResult.proofDurationMs / 1000).toFixed(1)}s ·
              local verify {claimResult.verifyTimeMs.toFixed(0)}ms ✓
            </p>
            <button
              className={`${styles.btn} ${styles.btnDanger}`}
              disabled={!online || !!busy || (!!rejection && nullifierClaimed)}
              onClick={claimAgain}
              title={
                rejection && nullifierClaimed ? t("result.claimAgainTitle") : undefined
              }
            >
              {busy ?? t("result.claimAgainButton")}
            </button>
            {nullifierClaimed && !rejection && (
              <p className={styles.callout}>
                <code>has_claimed</code> is true for this nullifier — a replay will be rejected
                on-chain.
              </p>
            )}
            {rejection && (
              <>
                <div className={styles.rejected}>
                  <strong>Rejected on-chain:</strong> {rejection}
                </div>
                <button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  disabled={!!busy}
                  onClick={resetToLanding}
                >
                  {t("result.startNewCircle")}
                </button>
              </>
            )}
            {rejection && (
              <div className={styles.newCircleCta}>
                <button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  disabled={!!busy}
                  onClick={resetToLanding}
                >
                  {t("result.startNewCircleAlt")}
                </button>
                <p className={styles.fineprint}>
                  Circle #{circleId?.toString()} stays on-chain forever —{" "}
                  <a className={styles.link} href={explorerContract()} target="_blank" rel="noreferrer">
                    view on explorer ↗
                  </a>
                  {t("result.newCircleOutro")}
                </p>
              </div>
            )}
          </div>
        )}

        {error && <p className="error">{error}</p>}

        {/* ── Debug bundle footer ──────────────────────────────────────────
          Always visible once a circle is active so a user can grab the
          snapshot at any point — not just on error. Placed last so it
          doesn't distract from the happy path. */}
        <div className="debug-bundle-footer">
          <CopyDebugBundleButton
            circleId={circleId}
            round={round}
            currentStep={claimStage}
            lastError={error}
            fundedCount={fundedCount}
            circleSize={CIRCLE_SIZE}
            pot={pot}
            timings={stepTimings}
          />
        </div>
      </div>
    </div>
  );
}
