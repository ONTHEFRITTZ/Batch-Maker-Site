const features = [
  {
    title: "Recipe organization",
    description:
      "Keep all your recipes in one place with clear ingredients, yields, and notes your team can actually follow.",
    icon: "📝",
  },
  {
    title: "Batch planning",
    description:
      "Plan production by batch instead of guessing. Scale recipes without spreadsheets or mental math.",
    icon: "⚖️",
  },
  {
    title: "Clear workflows",
    description:
      "Turn messy prep into simple step-by-step workflows that make busy mornings calmer.",
    icon: "🔁",
  },
  {
    title: "Built for small teams",
    description:
      "No bloated dashboards. Just the tools small bakeries and kitchens actually need.",
    icon: "🤝",
  },
]

export default function Features() {
  return (
    <section className="mb-16">
      <h2 className="text-2xl font-semibold mb-8 text-center">
        Designed for real kitchens
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="bg-white border border-gray-200 rounded-2xl p-6 shadow-soft"
          >
            <div className="text-2xl mb-3">{feature.icon}</div>
            <h3 className="text-lg font-semibold mb-2">
              {feature.title}
            </h3>
            <p className="text-bakery-muted text-sm leading-relaxed">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
