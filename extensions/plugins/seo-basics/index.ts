import type {
  CmsSeoAnalysisInputV1,
  CmsSeoAnalysisOutputV1,
  SeoPageContributionV1,
  SeoSiteContributionV1,
} from "../../../core/plugin-host/index.js";

export type SeoBasicsPluginCallbacks = Readonly<{
  analyzeCmsSeo(input: CmsSeoAnalysisInputV1): CmsSeoAnalysisOutputV1;
  contributePageSeo(input: unknown): SeoPageContributionV1;
  contributeSiteSeo(input: unknown): SeoSiteContributionV1;
}>;
