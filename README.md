# AP Research Page - Prompt Engineering Study

A Next.js application for a quasi-experimental prompt engineering study. This web application guides students through a research study comparing control and treatment groups for AI prompt engineering education.

## Features

- Consent and pre-survey
- Randomized group assignment (control vs treatment)
- Educational modules (Prompt Engineering vs Digital Literacy)
- Writing task with AI disclosure
- Post-survey with reflection questions
- Client-side data storage (for demo purposes)

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Build for Production

Build the application:

```bash
npm run build
```

Run the production server:

```bash
npm start
```

## Deployment

### Deploy to Vercel (Recommended)

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new):

1. Push your code to GitHub
2. Import your repository to Vercel
3. Vercel will automatically detect Next.js and deploy

### Deploy to Netlify

1. Build the application: `npm run build`
2. Add a `netlify.toml` file with the following:

```toml
[build]
  command = "npm run build"
  publish = ".next"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

3. Connect your repository to Netlify
4. Deploy

### Deploy to Other Platforms

Since this is a Next.js application, you can deploy it to any platform that supports Node.js:
- Railway
- Heroku
- AWS
- Google Cloud Platform
- DigitalOcean

## Project Structure

```
.
├── app/
│   ├── layout.tsx      # Root layout with metadata
│   ├── page.tsx        # Home page
│   └── globals.css     # Global styles
├── components/
│   └── PromptStudy.tsx # Main study component
├── prompt-study.tsx    # Original component (legacy)
├── package.json        # Dependencies and scripts
├── tsconfig.json       # TypeScript configuration
└── next.config.js      # Next.js configuration
```

## Technologies

- **Next.js 14** - React framework
- **React 18** - UI library
- **TypeScript** - Type safety
- **CSS** - Styling

## License

This project is for educational purposes.


