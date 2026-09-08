/**
 * Seeds one real project — "Integrated Visual Detection Methods for Fresh
 * Produce Quality Assessment" — for an EXISTING user account (auth users
 * can't be created here without a real email/password flow, so this
 * attaches to a user you've already signed up in the app).
 *
 * Content is drawn from the SoSC-CDMS Collaborative Research Grant proposal
 * "Developing Integrated Visual Detection Methods for Quality Assessment of
 * Selected Fresh Produce" (YOLOv11 computer vision for apple/tomato
 * grading), used here as a realistic end-to-end test of every page.
 *
 * Usage:
 *   npx tsx scripts/seed.ts <user-email>
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in the
 * environment (.env.local is loaded automatically).
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!email) {
  console.error("Usage: npx tsx scripts/seed.ts <user-email>");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data: usersPage, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw listErr;
  const user = usersPage.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`No signed-up user found with email ${email}. Sign up in the app first, then re-run this script.`);
    process.exit(1);
  }

  const { data: project, error: projectErr } = await admin
    .from("projects")
    .insert({
      owner_id: user.id,
      name: "Integrated Visual Detection Methods for Fresh Produce Quality Assessment",
      research_question:
        "Can a real-time computer vision system based on YOLOv11 be developed and validated for automated, field-deployable quality assessment of apples and tomatoes across the supply chain, replacing slow and subjective manual inspection?",
      aim:
        "Build and test a real-time YOLOv11-based computer vision system for automated quality assessment of apples and tomatoes at multiple stages of the supply chain, to reduce human error, cut post-harvest losses, and produce more reliable shelf-life estimates.",
      pcc_population: "Apples and tomatoes assessed at farm, packing-house, and retail stages of the supply chain",
      pcc_concept: "YOLOv11-based real-time computer vision for automated quality grading, defect detection, and ripeness classification",
      pcc_context: "Australian fresh produce supply chain and postharvest quality control, published 2019 to present",
      scope_notes:
        "Focuses on RGB/optical imaging-based computer vision methods. Excludes livestock and processed/packaged food grading, and excludes purely spectroscopic methods with no imaging-based classification component.",
      identified_count: 45,
      duplicates_removed_count: 6,
      excluded_screening_count: 15,
    })
    .select("id")
    .single();
  if (projectErr) throw projectErr;
  const projectId = project.id;
  console.log("Created project", projectId);

  await admin.from("project_sub_questions").insert([
    { project_id: projectId, content: "What quality, defect, and ripeness classes have prior YOLO-based and CNN-based systems used for apples and tomatoes?", position: 0 },
    { project_id: projectId, content: "How do reported lab benchmarks (e.g. MobileNetV3, YOLOv11-MHS) compare to real field-deployment performance?", position: 1 },
    { project_id: projectId, content: "What data augmentation strategies best address the lab-to-field generalisation gap noted in the literature?", position: 2 },
    { project_id: projectId, content: "What deployment barriers (compute, cost, usability) are reported when moving these systems from prototype to field use?", position: 3 },
  ]);

  await admin.from("project_objectives").insert([
    { project_id: projectId, content: "Build labelled apple (OECD 4-class) and tomato (USDA 6-class) RGB image datasets under Australian conditions.", position: 0 },
    { project_id: projectId, content: "Design and train a YOLOv11-based model for real-time quality classification of apples and tomatoes.", position: 1 },
    { project_id: projectId, content: "Benchmark model performance (mAP@0.5, precision, recall, inference speed) against published baselines and expert human assessment.", position: 2 },
    { project_id: projectId, content: "Export the model to ONNX and integrate it into a mobile/edge application tested with non-expert operators.", position: 3 },
  ]);

  await admin.from("search_blocks").insert([
    { project_id: projectId, name: "AI/ML methods", terms: ["YOLO", "YOLOv11", "convolutional neural network", "deep learning", "computer vision", "MobileNet"], position: 0 },
    { project_id: projectId, name: "Produce", terms: ["apple", "tomato", "fresh produce", "fruit", "vegetable"], position: 1 },
    { project_id: projectId, name: "Quality assessment", terms: ["quality grading", "defect detection", "ripeness classification", "freshness detection"], position: 2 },
  ]);

  await admin.from("screening_criteria").insert([
    { project_id: projectId, type: "include", content: "Applies a CNN or deep-learning computer vision model to apple, tomato, or closely comparable fresh produce quality/defect/ripeness classification.", position: 0 },
    { project_id: projectId, type: "include", content: "Published 2019 or later.", position: 1 },
    { project_id: projectId, type: "include", content: "Reports quantitative performance metrics (accuracy, mAP, precision/recall, or F1).", position: 2 },
    { project_id: projectId, type: "exclude", content: "Uses only non-visual sensing (e.g. hyperspectral) with no image-based classification component.", position: 0 },
    { project_id: projectId, type: "exclude", content: "Not peer-reviewed and not a citable preprint with reported results.", position: 1 },
  ]);

  const papers = [
    {
      citation: "Maraveas et al. (2025). Real-time freshness prediction for apples and lettuces using imaging recognition and advanced algorithms in a user-friendly mobile application. Smart Agricultural Technology, 12:101129.",
      theme: "Model benchmarking",
      method: "Compared 9 deep learning architectures for on-device classification",
      dataset: "Apple and lettuce RGB images",
      key_result: "MobileNetV3 reached 99.95% apple accuracy and 99.17% lettuce accuracy, with only 2.5M parameters and 22.5ms inference — confirms mobile-deployable CV is feasible.",
      status: "keep",
    },
    {
      citation: "Febriani & Kartikasari (2025). Detecting avocado freshness in real-time: A YOLO-based deep learning approach. Jurnal Teknik Informatika (Jutif), 6(3):1485-1502.",
      theme: "YOLO architectures",
      method: "YOLOv8 real-time detection",
      dataset: "Avocado images, controlled capture",
      key_result: "~98% real-time freshness classification accuracy; tested only in lab conditions.",
      status: "keep",
    },
    {
      citation: "Wei, Tang, Liu et al. (2025). Pork-YOLO: Automated collection of pork quality traits. Journal of Agriculture and Food Research, 21:101838.",
      theme: "YOLO architectures",
      method: "YOLO-based automated trait detection pipeline",
      dataset: "Pork carcass quality images",
      key_result: "High-accuracy automated trait collection at scale — cross-domain evidence that YOLO transfers to produce grading.",
      status: "keep",
    },
    {
      citation: "FASE (2025). An improved YOLOv11-MHS architecture for tomato ripeness classification, evaluated on the FruitQ benchmark.",
      theme: "Ripeness classification",
      method: "YOLOv11-MHS (modified head/backbone) vs YOLOv11n baseline",
      dataset: "FruitQ benchmark, 9,421 images",
      key_result: "+1.7% mAP@0.5 over YOLOv11n with 35.2% fewer parameters; precision 0.939, recall 0.917, mAP@0.5 0.974.",
      status: "keep",
    },
    {
      citation: "Mommoh, Obetta, John et al. (2024). Detection of fruit ripeness and defectiveness using convolutional neural networks. Information Dynamics and Applications, 3(3):184-199.",
      theme: "Ripeness classification",
      method: "CNN ripeness/defect classifier",
      dataset: "Fruit images labelled to USDA-style ripening stages",
      key_result: "Reliable separation of ripeness stages and a distinct defect class using a standard CNN.",
      status: "keep",
    },
    {
      citation: "Saleem, Potgieter & Arif (2019). Plant disease detection and classification by deep learning. Plants, 8(11):468.",
      theme: "Model benchmarking",
      method: "Survey/benchmark of CNN vs traditional ML for plant imaging tasks",
      dataset: "Multiple public plant disease datasets",
      key_result: "CNNs consistently outperform traditional ML once trained on sufficiently large labelled datasets; flags lab-to-field generalisation as a recurring limitation.",
      status: "keep",
    },
    {
      citation: "Chang, Zhang, Kong & Mujumdar (2025). Artificial intelligence-driven postharvest quality control of fruit and vegetable products: Intelligent detection, optimization strategies and application prospects. Food Bioscience, 79:108004.",
      theme: "Postharvest AI review",
      method: "Narrative review",
      dataset: "N/A (review)",
      key_result: "Synthesizes AI adoption trends across grading, sorting, and storage; identifies lab-vs-field validation as an open gap.",
      status: "keep",
    },
    {
      citation: "Ma, Yi, Wisuthiphaet, Earles & Nitin (2023). Accelerating the detection of bacteria in food using artificial intelligence and optical imaging. Applied and Environmental Microbiology, 89(1):e01828-22.",
      theme: "",
      method: "AI + optical imaging for bacterial detection",
      dataset: "Food safety optical imaging samples",
      key_result: "Cuts bacterial detection time from days to hours — tangential to visual quality grading, kept for scope discussion.",
      status: "pending",
    },
  ] as const;

  for (const paper of papers) {
    const { data: source } = await admin
      .from("sources")
      .insert({ citation: paper.citation, library_owner_id: user.id })
      .select("id")
      .single();
    if (!source) continue;
    await admin.from("project_sources").insert({
      project_id: projectId,
      source_id: source.id,
      method: paper.method || null,
      dataset: paper.dataset || null,
      key_result: paper.key_result || null,
      theme: paper.theme || null,
      status: paper.status,
      added_by: user.id,
    });
  }

  console.log("Seed complete — open the app and visit your projects dashboard.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
