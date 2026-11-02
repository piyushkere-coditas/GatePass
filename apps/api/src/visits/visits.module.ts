import { Module } from '@nestjs/common';
import { VisitCodeService } from './visit-code.service';
import { VisitStateService } from './state/visit-state.service';

@Module({
  providers: [VisitStateService, VisitCodeService],
  exports: [VisitStateService, VisitCodeService],
})
export class VisitsModule {}
