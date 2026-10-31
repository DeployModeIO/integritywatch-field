# IntegrityWatch Field — Manual do Usuário

**Para quem este manual é:** operadores de campo, engenheiros de integridade, supervisores de manutenção e operações. Nenhum conhecimento de programação necessário. O aplicativo funciona **100% offline**. Seus dados nunca saem do seu computador.

---

## 1. Instalação e abertura do aplicativo

### Windows (portátil)
1. Baixe `IntegrityWatch-Field-Portable.part1.rar` e `part2.rar` do GitHub Releases.
2. Coloque todos os arquivos em uma mesma pasta e extraia com WinRAR ou 7-Zip.
3. Clique duas vezes em `START-HERE.bat`. Um servidor local é iniciado e o navegador abre o aplicativo.
4. O aplicativo também pode rodar em um pen drive. Sem instalação, sem permissões de administrador necessárias.

### macOS
1. Extraia o pacote e clique duas vezes em `START-HERE.command`.
2. O navegador abre `http://localhost:8419`.

### Linux
1. Extraia o pacote e clique duas vezes em `start.sh` (ou execute `./start.sh`).
2. O navegador abre `http://localhost:8419`.

### Instale como aplicativo (PWA) — recomendado para uso diário
1. Inicie o aplicativo com `START-HERE.bat`.
2. Na barra de endereço do navegador, clique no ícone **Instalar** (ou no menu ⋮ → "Instalar app").
3. A partir desse momento, o aplicativo abre a partir de seu ícone e funciona totalmente offline.

**Requisitos:** Chrome, Edge, Firefox ou Safari dos últimos dois anos. Tela mínima de 1366×768. Funciona em tablets e celulares.

---

## 2. Primeira abertura (5 minutos)

1. O aplicativo carrega com **dados de demonstração**: 8 pontos de corrosão, 5 válvulas, um tubo com 12 ativos, 9 ativos de APM e cerca de 120 leituras. Isso mostra que todas as telas funcionam.
2. **Escolha seu idioma** no cabeçalho: Inglês, Español, Français, Português, 简体中文, Русский, العربية. O árabe muda o layout para direita-esquerda.
3. **Escolha seu tema**: o botão ☀/🌙/🖥 alterna entre claro → escuro → automático. A sua escolha é salva.
4. **Filtro de setor** (Todos / Upstream / Midstream / Downstream) filtra o Painel e os ativos de APM.

> Para começar com seus próprios dados: menu **Admin → Reset demo data** (ou limpe tudo).

---

## 3. Monitoramento de corrosão

1. **Crie um ponto de monitoramento**: Corrosão → "Novo ponto". Preencha o código (exemplo: MP-CORR-021), material (13 aços e ligas), tipo de sensor (cupom, ER, LPR, probe de H₂S, UT, visual) e dados do processo (H₂S, CO₂, pressão, temperatura, BS&W, velocidade, alvo de inibidor e resíduo). Adicione proteção catódica e isolamento contra CUI, se aplicável.
2. **Registre leituras**: abra o ponto → "Nova leitura" → data + taxa (mpy) + nota.
3. **Registre cupons (pares inibidor/vazio)**: "Novo cupom" → escolha o **Role** (Vazio ou Inibido) e o **Par** (exemplo: P3), depois peso inicial e final, área e dias. A taxa de corrosão é calculada automaticamente (ASTM G1/G4). O painel **Eficiência do Inibidor** compara os dois cupons e classifica o resultado (Excelente ≥90%, Ruim <70%).
4. **Painéis automáticos**: balanço de inibidor (janela de 80–150%), modelo De Waard–Milliams versus medição, análise de corrosão em ambientes ácidos NACE MR0175 (pH₂S), proteção catódica e CUI.
5. **Relatório do ponto**: o botão "Relatório do ponto" gera um relatório impresso — uma página por ponto de monitoramento.

---

## 4. Válvulas de segurança de pressão (PSV)

1. **Registre uma válvula**: "Nova PSV" → etiqueta, tipo (convenção / bocal equilibrado / pilot), fluido (11 pré-carregados, editáveis), pressão de ajuste, temperatura, pressão de retorno e datas de teste.
2. **Calcule o tamanho**: abra a válvula → abas **Gás** e **Líquido**:
   - Gás: fluxo W, pressão/temperatura, Z, M, k → área necessária conforme API 520. O aplicativo detecta fluxo crítico ou subcrítico.
   - Líquido: fluxo Q, gravidade G, viscosidade → área com correção de viscosidade Kv.
   - O aplicativo **seleciona a orifício API 526** (D–T) e mostra a margem e a capacidade real.
3. **Salve o cálculo** na válvula e imprima o **manual técnico** (formato API 520 / ISA).

---

## 5. Tubulações (midstream)

1. **Crie o sistema**: nome, operador, produto, diâmetro, espessura da parede, material, comprimento e faixa de estações (km).
2. **Ativos da linha**: dentro do sistema, "Novo ativo da linha" → tipo (12 tipos: válvulas, flanges, estações de bomba e compressor, tanques, cruzamentos, ROW, medição…), km da estação e lado.
3. **Inspeções**: tipo (ILI, corrosão externa, visual, UT, reparo, substituição), seção em km, severidade, achados.
4. **Mapa**: nós desenhados na linha na escala de km, coloridos pela severidade da última inspeção. Navegável com teclado (Tab e Enter).

---

## 6. Desempenho do ativo (APM)

1. **Crie um ativo**: código, nome, setor, categoria (poços, plataformas, bombas, compressores, trocadores, torres, utilidades…), criticidade A/B/C e **Risco POF × COF** (estilo RBI). A data da próxima inspeção é sugerida com base no nível de risco.
2. **Registre eventos**: falha, manutenção, interrupção não planejada, ordem de trabalho ou inspeção, com datas e tempo de parada. O aplicativo calcula **disponibilidade, MTBF e MTTR** e exibe um indicador de saúde (vermelho/amarelo/verde).
3. A **matriz de risco 5×5** mostra onde cada ativo se encontra e qual prioridade de inspeção recebe.

---

## 7. Importação de seus dados (CSV, WITSML, JSON)

1. Aba **CSV** → "Escolha arquivo" (ou arraste o arquivo). Aceita arquivos separados por vírgula, ponto-e-vírgula ou tab.
2. Verifique a **associação de colunas** — o aplicativo detecta automaticamente ponto, data, taxa, Wi, Wf, área, dias, resíduo, temperatura, bsw, categoria, nota. Cabeçalhos em espanhol e inglês são reconhecidos.
3. Marque **"Criar pontos ausentes"** se o arquivo contiver novos pontos de monitoramento.
4. **Execute a validação** → a tabela de erros mostra linhas inválidas (data futura, Wf maior que Wi, fora de faixa, ponto desconhecido, duplicatas ignoradas). Se você mudar a caixa de seleção, valide novamente antes da importação.
5. **Importar** → resumo, e a ação é registrada no histórico.
6. Abas extras: **WITSML** (poços, trajetórias, canais) e **JSON** (backup completo, modo de fusão ou substituição).

---

## 8. Regras e recomendações

- Clique em **Executar regras** (botão no cabeçalho) para analisar tudo. O aplicativo possui 17 regras técnicas (R1–R17): taxas de perda de parede, pitting, testes de PSV atrasados, problemas com inibidores, achados em tubulações e movimentos de risco em APM.
- Cada recomendação mostra a regra, os valores reais, o ativo afetado e um link para o registro.
- Ações: **Aprovar** → **Resolver** (com uma nota). Tudo é marcado com data e usuário.
- Se a condição voltar após a resolução, a recomendação **abre automaticamente novamente**.

---

## 9. Relatórios

1. **Relatório trimestral**: escolha o período → Gerar → página de capa, KPIs, gráfico semanal, pontos mais críticos, eficiência de pares, campanhas e recomendações abertas. Botão **Imprimir** → "Salvar como PDF".
2. **Relatório do ponto**: ficha técnica + histórico + cálculos ASTM G1/G4 + classificação SP0775 + tela de NACE MR0175.
3. **Ficha técnica da válvula**: folha completa de dimensionamento, copiável para a área de transferência.

---

## 10. Cópias de segurança

1. **Admin → Exportar** cria um arquivo JSON com todos seus dados. Salve no rede ou em um pen drive.
2. **Restaurar**: Ingestão → aba JSON → escolha o arquivo → modo **Fusão** (adiciona) ou **Substituição** (recria totalmente).
3. Faça backup **a cada semana** e sempre antes de grandes importações.

---

## 11. Recepções rápidas

| O que você quer... | Faça isso |
|---|---|
| Carregar a campanha mensal de cupons | Ingestão → CSV → arquivo → validar → importar → atribuir Role/Par → Executar regras → verificar Recomendações |
| Programar uma inspeção RBI | APM → ativo → ajustar POF/COF → reagendar próxima inspeção (a data segue o risco) |
| Imprimir o relatório trimestral | Relatórios → Trimestral → datas → Gerar → Imprimir → PDF |
| Mover dados para um segundo laptop | Admin → Exportar → copiar o JSON → no outro laptop: Ingestão → JSON → Fusão |

---

## 12. Solução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| "Porto ocupado" ao iniciar START-HERE | Outro programa usa a porta 8419 | Execute `tools\serve.ps1 -Port 9000`, ou feche o programa em conflito |
| PowerShell bloqueia o script | Política de execução | Use `START-HERE.bat` (já inclui a exceção), ou `py tools\serve.py` |
| Sem botão "Instalar app" | Abriu `index.html` diretamente do disco | Inicie com `START-HERE.bat` (o PWA precisa de `http://localhost`) |
| Dados desapareceram | Modo privado/incógnito, ou dados do site limpos | Restaure seu backup JSON; evite modos privados |
| Banner "Atualização disponível" | Nova versão publicada | Clique em **Recarregar** no banner |
| Versão antiga ainda exibida | Cache do service worker | Clique em **Recarregar**, ou pressione Ctrl+F5, ou no DevTools → Aplicativo → Service Workers → Atualizar |

---

## 13. Observações importantes

- O IntegrityWatch Field é uma **ferramenta de apoio**. Não substitui a avaliação técnica de um engenheiro qualificado.
- Verifique todos os cálculos contra a edição atual dos padrões aplicáveis (API 510/570/653, ASME PCC-2, NACE SP0775/MR0175, ASTM G1/G4) e dados do fabricante antes de qualquer decisão operacional.
- Licença MIT. Livre para uso, cópia e modificação. Link do repositório: veja o repositório deste projeto.

---

## Validação de entrada de dados (31-10-2026)

Cada módulo que aceita dados foi exercitado pelo seu próprio formulário: ponto de monitoramento, leitura manual, cupom, ativo, evento de ativo, válvula de alívio, sistema de duto, ativo de linha, inspeção, ingestão CSV e os três relatórios. **9 formulários salvos, 22 capturas, 0 erros.** O armazenamento ficou com 9 pontos, 137 leituras, 5 cupons, 19 ativos, 25 eventos, 6 PSVs, 2 sistemas, 13 ativos de linha e 6 inspeções.

Registro completo: `docs/data-entry-2026-10-31/`

![Novo ponto de monitoramento](../data-entry-2026-10-31/02-corrosion-new-point.png)

![Cupom com cálculo ASTM](../data-entry-2026-10-31/04-corrosion-new-coupon.png)

![Evento de falha do ativo](../data-entry-2026-10-31/06-apm-new-event.png)

![Achado de inspeção](../data-entry-2026-10-31/10-pipelines-new-inspection.png)

![Resumo da validação CSV](../data-entry-2026-10-31/12-ingest-csv-validation.png)
